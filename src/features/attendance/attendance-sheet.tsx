'use client';

/**
 * ورقة الحضور الجماعية (لكل حصة) — تختار مجموعة + فترة ثم حصة واحدة، تعرض أعضاء
 * المجموعة مع حالة لكل رياضي، وتحفظ عبر POST /attendance/bulk وفق bulkAttendanceSchema
 * (markAllPresent + تجاوزات فردية). لا بيانات وهمية: كل حفظ يستدعي نقطة النهاية الفعلية.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Save, Users } from 'lucide-react';
import type { AttendanceStatusName, BulkAttendanceResult, GroupDto } from '@/shared/api/types';
import { apiPost, newIdempotencyKey } from '@/shared/api/client';
import { useApi, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { tr } from '@/features/common/tr';
import { todayFor } from '@/shared/lib/format';
import { ATTENDANCE_STATUSES } from '@/shared/lib/options';
import { Button } from '@/shared/ui-kit/button';
import { Select } from '@/shared/ui-kit/select';
import { DatePicker, Checkbox } from '@/shared/ui-kit/date-picker';
import { Input } from '@/shared/ui-kit/input';
import { Modal } from '@/shared/ui-kit/modal';
import { Field, ErrorText } from '@/shared/ui-kit/form';
import { StatusBadge } from '@/shared/ui-kit/status-badge';
import { EmptyState } from '@/shared/ui-kit/empty-state';
import { Loading } from '@/shared/ui-kit/loading';
import { ErrorState } from '@/shared/ui-kit/error-state';
import { useToast } from '@/shared/ui-kit/toast';

interface SheetMember {
  id: string;
  athleteId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
}

interface SheetSession {
  id: string;
  title: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: string;
}

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

interface DraftEntry {
  status: AttendanceStatusName;
  minutesLate: number;
}

interface BulkEntryBody {
  athleteId: string;
  status: AttendanceStatusName;
  minutesLate?: number;
}

interface BulkBody {
  sessionId: string;
  markAllPresent: boolean;
  entries: BulkEntryBody[];
  method: 'BULK';
}

const STATUS_AR_FALLBACK: Record<AttendanceStatusName, string> = {
  PRESENT: 'حاضر',
  ABSENT: 'غائب',
  LATE: 'متأخر',
  EXCUSED: 'غياب مبرر',
};

function isAttendanceStatus(value: string): value is AttendanceStatusName {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

function clampLate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(600, Math.trunc(value)));
}

export interface AttendanceSheetScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialGroupId: string;
  initialFrom: string;
  initialTo: string;
  onSaved?: () => void;
}

export function AttendanceSheetScreen({
  open,
  onOpenChange,
  initialGroupId,
  initialFrom,
  initialTo,
  onSaved,
}: AttendanceSheetScreenProps) {
  const t = useTranslations('attendance');
  const tc = useTranslations('common');
  const tStatus = useTranslations('status');
  const tGroup = useTranslations('group');
  const errorText = useErrorText();
  const toast = useToast();
  const fmt = useFormatters();
  const { settings } = useSession();

  const [groupId, setGroupId] = useState(initialGroupId);
  const [from, setFrom] = useState(initialFrom || todayFor(settings));
  const [to, setTo] = useState(initialTo || from);
  const [sessionId, setSessionId] = useState('');
  const [markAllPresent, setMarkAllPresent] = useState(true);
  const [draft, setDraft] = useState<Record<string, DraftEntry>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkAttendanceResult | null>(null);

  // إعادة ضبط الحقول الأولية عند كل فتح
  useEffect(() => {
    if (open) {
      setGroupId(initialGroupId);
      setFrom(initialFrom || todayFor(settings));
      setTo(initialTo || initialFrom || todayFor(settings));
      setSessionId('');
      setDraft({});
      setResult(null);
      setSaveError(null);
    }
  }, [open, initialGroupId, initialFrom, initialTo, settings]);

  const groups = useApi<GroupDto[]>(open ? '/groups' : null, { params: { pageSize: 100, status: 'ACTIVE' } });

  const sheet = useApi<AttendanceSheetData>(open && groupId !== '' ? '/attendance/sheet' : null, {
    params: useMemo(() => ({ groupId: groupId || undefined, from: from || undefined, to: to || undefined }), [groupId, from, to]),
  });

  const groupOptions = useMemo(() => (groups.data ?? []).map((g) => ({ value: g.id, label: g.name })), [groups.data]);

  const sessions = sheet.data?.sessions ?? [];
  const sessionOptions = useMemo(
    () =>
      sessions.map((s) => ({
        value: s.id,
        label: `${s.title} — ${fmt.date(s.sessionDate)} ${fmt.time(s.startTime)}`,
      })),
    [sessions, fmt],
  );

  // اختيار أول حصة تلقائيًا عند توفرها
  useEffect(() => {
    if (sessionId === '' && sessions.length > 0) {
      setSessionId(sessions[0]?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.data]);

  // تعبئة المسودة من السجلات الموجودة للحصة المختارة
  useEffect(() => {
    if (!sheet.data || sessionId === '') {
      setDraft({});
      return;
    }
    const next: Record<string, DraftEntry> = {};
    for (const r of sheet.data.records) {
      if (r.sessionId !== sessionId) continue;
      if (isAttendanceStatus(r.status)) {
        next[r.athleteId] = { status: r.status, minutesLate: clampLate(r.minutesLate) };
      }
    }
    setDraft(next);
  }, [sheet.data, sessionId]);

  const members = sheet.data?.members ?? [];

  const setStatus = useCallback((athleteId: string, status: AttendanceStatusName | '') => {
    setDraft((prev) => {
      const copy = { ...prev };
      if (status === '') {
        delete copy[athleteId];
      } else {
        const existing = copy[athleteId];
        copy[athleteId] = { status, minutesLate: existing ? existing.minutesLate : 0 };
      }
      return copy;
    });
  }, []);

  const setLate = useCallback((athleteId: string, raw: string) => {
    setDraft((prev) => {
      const existing = prev[athleteId];
      if (!existing) return prev;
      return { ...prev, [athleteId]: { ...existing, minutesLate: clampLate(Number.parseInt(raw || '0', 10)) } };
    });
  }, []);

  const markAll = useCallback(
    (status: AttendanceStatusName) => {
      const next: Record<string, DraftEntry> = {};
      for (const m of members) next[m.athleteId] = { status, minutesLate: 0 };
      setDraft(next);
    },
    [members],
  );

  const statusOptions = useMemo(
    () =>
      [{ value: '', label: tr(t, 'unmarked', 'غير محدد') }].concat(
        ATTENDANCE_STATUSES.map((v) => ({ value: v, label: tr(tStatus, v, STATUS_AR_FALLBACK[v]) })),
      ),
    [tStatus, t],
  );

  const save = useCallback(async () => {
    if (sessionId === '') return;
    setSaving(true);
    setSaveError(null);
    setResult(null);

    const allEntries: BulkEntryBody[] = [];
    for (const m of members) {
      const e = draft[m.athleteId];
      if (!e) continue;
      const entry: BulkEntryBody = { athleteId: m.athleteId, status: e.status };
      if (e.status === 'LATE') entry.minutesLate = clampLate(e.minutesLate);
      allEntries.push(entry);
    }

    const entries = markAllPresent ? allEntries.filter((x) => x.status !== 'PRESENT') : allEntries;
    if (entries.length > 500) {
      setSaveError(tr(t, 'tooManyEntries', 'عدد التجاوزات يتجاوز الحد الأقصى (500)'));
      setSaving(false);
      return;
    }

    const body: BulkBody = {
      sessionId,
      markAllPresent,
      entries,
      method: 'BULK',
    };

    try {
      const res = await apiPost<BulkAttendanceResult>('/attendance/bulk', body, {
        idempotencyKey: newIdempotencyKey(),
      });
      setResult(res.data);
      toast.success(tc('success'));
      sheet.reload();
      onSaved?.();
    } catch (e) {
      setSaveError(errorText(e));
    } finally {
      setSaving(false);
    }
  }, [sessionId, members, draft, markAllPresent, tc, toast, errorText, sheet, onSaved, t]);

  const draftCount = Object.keys(draft).length;

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!saving) onOpenChange(o);
      }}
      title={tr(t, 'sheetTitle', 'ورقة حضور المجموعة')}
      description={tr(t, 'bulkHint', 'اضغط على حالة كل رياضي لتغييرها، ثم احفظ')}
      size="xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {tc('cancel')}
          </Button>
          <Button type="button" onClick={() => void save()} loading={saving} disabled={sessionId === ''}>
            <Save className="size-4" aria-hidden />
            {tr(t, 'saveAttendance', 'حفظ الحضور')}
          </Button>
        </>
      }
    >
      {saveError ? (
        <div className="mb-3">
          <ErrorText message={saveError} />
        </div>
      ) : null}
      {result ? (
        <div className="mb-3 rounded-lg border border-success/40 bg-success/10 p-3 text-sm" role="status">
          <p className="font-bold text-success">
            {tr(t, 'savedResult', 'تم حفظ الحضور')} —{' '}
            <span className="ltr-field tabular-nums">
              {tr(t, 'recordsCount', '{count} سجل', { count: result.created + result.updated })}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tr(t, 'created', 'إنشاء')}: {result.created} · {tr(t, 'updated', 'تحديث')}: {result.updated} ·{' '}
            {tr(t, 'skipped', 'تخطي')}: {result.skipped}
          </p>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="w-48">
          <Field label={tGroup('title')} htmlFor="sh-group">
            <Select
              id="sh-group"
              value={groupId}
              placeholder={t('selectGroup')}
              options={groupOptions}
              onChange={(e) => {
                setGroupId(e.target.value);
                setSessionId('');
              }}
            />
          </Field>
        </div>
        <div className="w-36">
          <Field label={tc('from')} htmlFor="sh-from">
            <DatePicker id="sh-from" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
        </div>
        <div className="w-36">
          <Field label={tc('to')} htmlFor="sh-to">
            <DatePicker id="sh-to" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <div className="w-64">
          <Field label={t('selectSession')} htmlFor="sh-session">
            <Select
              id="sh-session"
              value={sessionId}
              placeholder={t('selectSession')}
              options={sessionOptions}
              disabled={groupId === '' || sessionOptions.length === 0}
              onChange={(e) => setSessionId(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {groupId === '' ? (
        <EmptyState title={t('selectGroup')} />
      ) : sheet.loading ? (
        <Loading label={tc('loading')} />
      ) : sheet.error ? (
        <ErrorState message={errorText(sheet.error)} onRetry={sheet.reload} />
      ) : members.length === 0 ? (
        <EmptyState title={tr(t, 'noMembers', 'لا يوجد أعضاء في هذه المجموعة')} icon={<Users className="size-6" aria-hidden />} />
      ) : sessions.length === 0 ? (
        <EmptyState title={tr(t, 'noSessions', 'لا توجد حصص لهذه المجموعة في هذه الفترة')} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-2.5">
            <Checkbox
              id="sh-all-present"
              label={tr(t, 'markAllPresent', 'تحديد الكل حاضر')}
              checked={markAllPresent}
              onChange={(e) => setMarkAllPresent(e.target.checked)}
            />
            <Button type="button" size="sm" variant="ghost" onClick={() => markAll('PRESENT')}>
              {tr(t, 'setAllPresent', 'اجعل الكل حاضر')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => markAll('ABSENT')}>
              {tr(t, 'setAllAbsent', 'اجعل الكل غائب')}
            </Button>
            <span className="ms-auto text-xs text-muted-foreground" aria-live="polite">
              {tr(t, 'markedCount', 'حُدد {count} رياضيًا', { count: draftCount })}
            </span>
          </div>

          <div className="divide-y divide-border overflow-x-auto rounded-lg border border-border">
            {members.map((m) => {
              const entry = draft[m.athleteId];
              const statusValue = entry?.status ?? '';
              return (
                <div key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="min-w-40 flex-1 truncate text-sm font-medium">
                    {m.firstName} {m.lastName}
                  </span>
                  {entry?.status ? (
                    <StatusBadge value={entry.status} label={tr(tStatus, entry.status, STATUS_AR_FALLBACK[entry.status])} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                  <div className="w-40">
                    <Select
                      aria-label={`${m.firstName} ${m.lastName}`}
                      value={statusValue}
                      options={statusOptions}
                      onChange={(e) => {
                        const v = e.target.value;
                        setStatus(m.athleteId, v === '' ? '' : isAttendanceStatus(v) ? v : '');
                      }}
                    />
                  </div>
                  {entry?.status === 'LATE' ? (
                    <div className="w-28">
                      <Input
                        aria-label={tr(t, 'minutesLate', 'دقائق التأخر')}
                        ltr
                        inputMode="numeric"
                        value={String(entry.minutesLate)}
                        onChange={(e) => setLate(m.athleteId, e.target.value)}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}
