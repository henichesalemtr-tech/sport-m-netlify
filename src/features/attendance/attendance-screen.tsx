'use client';

/**
 * شاشة الحضور — مرشحات (مجموعة/حصة/فترة) + قائمة السجلات مع شارات الحالة
 * وإمكانية تعديل السجل (الحالة/دقائق التأخر/ملاحظات) عبر PATCH /attendance،
 * وفتح ورقة الحضور الجماعية (AttendanceSheet) لنفس المجموعة والفترة.
 *
 * ملاحظة تعاقدي: GET /attendance/sheet يعيد {members, sessions, records} —
 * الأعضاء بأسمائهم والحصص بتواريخها والسجلات المطابقة للمرشحات. نستخدمه كمصدر
 * وحيد غنيّ للقائمة (كل صف حقيقي من نقطة نهاية فعلية) بدل عرض معرّفات مجهولة.
 */
import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ClipboardList, Pencil, UserCheck } from 'lucide-react';
import type { AttendanceRecordDto, AttendanceStatusName, GroupDto } from '@/shared/api/types';
import { apiPatch } from '@/shared/api/client';
import { useApi, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { tr } from '@/features/common/tr';
import { todayFor } from '@/shared/lib/format';
import { ATTENDANCE_STATUSES } from '@/shared/lib/options';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { Select } from '@/shared/ui-kit/select';
import { DatePicker } from '@/shared/ui-kit/date-picker';
import { Input } from '@/shared/ui-kit/input';
import { Textarea } from '@/shared/ui-kit/textarea';
import { DataTable, type DataTableColumn } from '@/shared/ui-kit/data-table';
import { StatusBadge } from '@/shared/ui-kit/status-badge';
import { Modal } from '@/shared/ui-kit/modal';
import { Field, ErrorText, FormGrid } from '@/shared/ui-kit/form';
import { EmptyState } from '@/shared/ui-kit/empty-state';
import { useToast } from '@/shared/ui-kit/toast';
import { AttendanceSheetScreen } from './attendance-sheet';

/** أعضاء ورقة الحضور (من GET /attendance/sheet). */
interface SheetMember {
  id: string;
  athleteId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
}

/** حصص الفترة (تواريخ ISO بعد JSON). */
interface SheetSession {
  id: string;
  title: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: string;
}

/** سجل حضور ضمن الورقة (حقل status قيمة نصية من الخادم). */
interface SheetRecord {
  id: string;
  athleteId: string;
  sessionId: string;
  status: string;
  minutesLate: number;
  consumedSession: boolean;
}

interface AttendanceSheetData {
  members: SheetMember[];
  sessions: SheetSession[];
  records: SheetRecord[];
}

/** صف معروض بعد إثراء الاسم/الحصة. */
interface EnrichedRow {
  id: string;
  athleteId: string;
  athleteName: string;
  sessionId: string;
  sessionLabel: string;
  status: AttendanceStatusName;
  minutesLate: number;
}

function isAttendanceStatus(value: string): value is AttendanceStatusName {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

const STATUS_AR_FALLBACK: Record<AttendanceStatusName, string> = {
  PRESENT: 'حاضر',
  ABSENT: 'غائب',
  LATE: 'متأخر',
  EXCUSED: 'غياب مبرر',
};

export function AttendanceScreen() {
  const t = useTranslations('attendance');
  const tc = useTranslations('common');
  const tStatus = useTranslations('status');
  const tGroup = useTranslations('group');
  const errorText = useErrorText();
  const toast = useToast();
  const fmt = useFormatters();
  const { can, settings } = useSession();

  const canView = can('attendance.view');
  const canCreate = can('attendance.create');
  const canEdit = can('attendance.edit');

  const [groupId, setGroupId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [from, setFrom] = useState<string>(() => todayFor(settings));
  const [to, setTo] = useState<string>(() => todayFor(settings));

  const [sheetOpen, setSheetOpen] = useState(false);

  // نموذج التعديل
  const [editRow, setEditRow] = useState<EnrichedRow | null>(null);
  const [editStatus, setEditStatus] = useState<AttendanceStatusName>('PRESENT');
  const [editLate, setEditLate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const groups = useApi<GroupDto[]>(canView ? '/groups' : null, { params: { pageSize: 100, status: 'ACTIVE' } });

  const sheetParams = useMemo(
    () => ({
      groupId: groupId || undefined,
      sessionId: sessionId || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [groupId, sessionId, from, to],
  );

  const sheet = useApi<AttendanceSheetData>(canView ? '/attendance/sheet' : null, {
    params: sheetParams,
    enabled: canView && groupId !== '',
  });

  const groupOptions = useMemo(
    () => (groups.data ?? []).map((g) => ({ value: g.id, label: g.name })),
    [groups.data],
  );

  const sessionOptions = useMemo(
    () =>
      (sheet.data?.sessions ?? []).map((s) => ({
        value: s.id,
        label: `${s.title} — ${fmt.date(s.sessionDate)} ${fmt.time(s.startTime)}`,
      })),
    [sheet.data, fmt],
  );

  const rows = useMemo<EnrichedRow[]>(() => {
    const d = sheet.data;
    if (!d) return [];
    const mmap = new Map(d.members.map((m) => [m.athleteId, m] as const));
    const smap = new Map(d.sessions.map((s) => [s.id, s] as const));
    return d.records.map((r) => {
      const m = mmap.get(r.athleteId);
      const s = smap.get(r.sessionId);
      return {
        id: r.id,
        athleteId: r.athleteId,
        athleteName: m ? `${m.firstName} ${m.lastName}` : r.athleteId,
        sessionId: r.sessionId,
        sessionLabel: s ? `${s.title} — ${fmt.date(s.sessionDate)}` : '',
        status: (isAttendanceStatus(r.status) ? r.status : 'PRESENT') as AttendanceStatusName,
        minutesLate: r.minutesLate,
      };
    });
  }, [sheet.data, fmt]);

  const statusOptionList = useMemo(
    () =>
      ATTENDANCE_STATUSES.map((v) => ({
        value: v,
        label: tr(tStatus, v, STATUS_AR_FALLBACK[v]),
      })),
    [tStatus],
  );

  const openEdit = (row: EnrichedRow) => {
    setEditRow(row);
    setEditStatus(row.status);
    setEditLate(row.status === 'LATE' ? String(row.minutesLate ?? 0) : '');
    setEditNotes('');
    setEditError(null);
  };

  const submitEdit = useCallback(async () => {
    if (!editRow) return;
    setSaving(true);
    setEditError(null);
    const minutesLate =
      editStatus === 'LATE' ? Number.parseInt(editLate || '0', 10) : Number.NaN;
    const body: Record<string, unknown> = {
      id: editRow.id,
      status: editStatus,
      notes: editNotes.trim() ? editNotes.trim() : null,
    };
    if (Number.isFinite(minutesLate)) body.minutesLate = Math.max(0, Math.min(600, minutesLate));
    try {
      await apiPatch<AttendanceRecordDto>('/attendance', body);
      toast.success(tc('success'));
      setEditRow(null);
      sheet.reload();
    } catch (e) {
      setEditError(errorText(e));
    } finally {
      setSaving(false);
    }
  }, [editRow, editStatus, editLate, editNotes, tc, toast, errorText, sheet]);

  const columns = useMemo<DataTableColumn<EnrichedRow>[]>(() => {
    const base: DataTableColumn<EnrichedRow>[] = [
      {
        header: tr(t, 'athlete', 'الرياضي'),
        cell: (r) => <span className="font-medium">{r.athleteName}</span>,
        showInCard: true,
      },
      {
        header: tr(t, 'session', 'الحصة'),
        cell: (r) => <span className="text-xs text-muted-foreground">{r.sessionLabel || '—'}</span>,
        showInCard: true,
      },
      {
        key: 'status',
        header: tc('status'),
        cell: (r) => <StatusBadge value={r.status} label={tr(tStatus, r.status, STATUS_AR_FALLBACK[r.status])} />,
        showInCard: true,
      },
      {
        key: 'minutesLate',
        header: tr(t, 'minutesLate', 'دقائق التأخر'),
        cell: (r) => (r.status === 'LATE' ? <span className="ltr-field tabular-nums">{r.minutesLate}</span> : '—'),
        align: 'end',
      },
    ];
    if (canEdit) {
      base.push({
        header: tc('actions'),
        align: 'end',
        showInCard: false,
        cell: (r) => (
          <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(r)}>
            <Pencil className="size-4" aria-hidden />
            {tr(t, 'editRecord', 'تعديل السجل')}
          </Button>
        ),
      });
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, tc, t, tStatus]);

  if (!canView) {
    return (
      <div>
        <PageHeader title={t('title')} />
        <div className="card p-0">
          <EmptyState title={tr(t, 'noAccess', 'لا تملك صلاحية عرض الحضور')} icon={<UserCheck className="size-6" aria-hidden />} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('title')}
        actions={
          canCreate && groupId !== '' ? (
            <Button type="button" onClick={() => setSheetOpen(true)}>
              <ClipboardList className="size-4" aria-hidden />
              {tr(t, 'sheet', 'ورقة الحضور')}
            </Button>
          ) : null
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-52">
          <Select
            aria-label={tGroup('title')}
            value={groupId}
            placeholder={`${tc('all')} — ${tGroup('title')}`}
            options={groupOptions}
            onChange={(e) => {
              setGroupId(e.target.value);
              setSessionId('');
            }}
          />
        </div>
        <div className="w-64">
          <Select
            aria-label={t('selectSession')}
            value={sessionId}
            placeholder={t('selectSession')}
            options={sessionOptions}
            disabled={groupId === ''}
            onChange={(e) => setSessionId(e.target.value)}
          />
        </div>
        <div className="w-40">
          <DatePicker
            aria-label={tc('from')}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setSessionId('');
            }}
          />
        </div>
        <div className="w-40">
          <DatePicker
            aria-label={tc('to')}
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setSessionId('');
            }}
          />
        </div>
      </div>

      {groupId === '' ? (
        <div className="card p-0">
          <EmptyState title={t('selectGroup')} hint={tr(t, 'chooseGroupHint', 'اختر مجموعة وتاريخًا لعرض سجلات الحضور')} />
        </div>
      ) : (
        <div className="card p-0">
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(r) => r.id}
            loading={sheet.loading}
            error={sheet.error ? errorText(sheet.error) : null}
            onRetry={sheet.reload}
            emptyTitle={tr(t, 'noRecords', 'لا توجد سجلات حضور في هذه الفترة')}
          />
        </div>
      )}

      {/* تعديل سجل حضور (PATCH /attendance) */}
      <Modal
        open={editRow !== null}
        onOpenChange={(o) => {
          if (!saving) setEditRow(o ? editRow : null);
        }}
        title={tr(t, 'editRecord', 'تعديل السجل')}
        size="md"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setEditRow(null)} disabled={saving}>
              {tc('cancel')}
            </Button>
            <Button type="button" onClick={() => void submitEdit()} loading={saving}>
              {tc('save')}
            </Button>
          </>
        }
      >
        {editError ? (
          <div className="mb-3">
            <ErrorText message={editError} />
          </div>
        ) : null}
        <p className="mb-3 text-sm text-muted-foreground">{editRow?.athleteName}</p>
        <FormGrid>
          <Field label={tc('status')} htmlFor="a-status">
            <Select
              id="a-status"
              value={editStatus}
              options={statusOptionList}
              onChange={(e) => {
                const v = e.target.value;
                if (isAttendanceStatus(v)) setEditStatus(v);
              }}
            />
          </Field>
          {editStatus === 'LATE' ? (
            <Field label={tr(t, 'minutesLate', 'دقائق التأخر')} htmlFor="a-late">
              <Input
                id="a-late"
                ltr
                inputMode="numeric"
                value={editLate}
                onChange={(e) => setEditLate(e.target.value)}
              />
            </Field>
          ) : null}
          <Field label={tc('notes')} htmlFor="a-notes" className="sm:col-span-2" optional>
            <Textarea id="a-notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
          </Field>
        </FormGrid>
      </Modal>

      {canCreate ? (
        <AttendanceSheetScreen
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          initialGroupId={groupId}
          initialFrom={from}
          initialTo={to}
          onSaved={() => {
            sheet.reload();
          }}
        />
      ) : null}
    </div>
  );
}
