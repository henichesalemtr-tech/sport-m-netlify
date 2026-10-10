'use client';

/**
 * شاشة الجدول: عروض شهر/أسبوع/يوم/أجندة (الأجندة محسّنة للموبايل)،
 * تلوين حسب النشاط، مرشحات، إنشاء/تعديل حصة مع عرض أخطاء التعارض،
 * توليد الحصص المتكررة، إلغاء وإعادة جدولة.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Repeat,
  XCircle,
  CalendarClock,
} from 'lucide-react';
import { ApiClientError, apiPatch, apiPost } from '@/shared/api/client';
import type { QueryParams } from '@/shared/api/client';
import type {
  CoachDto,
  GroupDto,
  SessionDto,
  SportDto,
  VenueDto,
} from '@/shared/api/types';
import { useApi, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useRouter } from '@/shared/i18n/navigation';
import { useFormatters } from '@/features/common/use-formatters';
import { todayFor } from '@/shared/lib/format';
import { SESSION_TYPES } from '@/shared/lib/options';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { Select } from '@/shared/ui-kit/select';
import { DatePicker, TimePicker } from '@/shared/ui-kit/date-picker';
import { Modal } from '@/shared/ui-kit/modal';
import { ConfirmDialog } from '@/shared/ui-kit/confirm-dialog';
import { Field, ErrorText, FormGrid } from '@/shared/ui-kit/form';
import { Input } from '@/shared/ui-kit/input';
import { Textarea } from '@/shared/ui-kit/textarea';
import { EmptyState } from '@/shared/ui-kit/empty-state';
import { ErrorState } from '@/shared/ui-kit/error-state';
import { Loading } from '@/shared/ui-kit/loading';
import { StatusBadge, Badge } from '@/shared/ui-kit/status-badge';
import { useToast } from '@/shared/ui-kit/toast';
import { cn } from '@/shared/ui-kit/utils';

type CalendarView = 'month' | 'week' | 'day' | 'agenda';

interface SessionFilters {
  sportId: string;
  groupId: string;
  coachId: string;
  venueId: string;
  type: string;
}

interface SessionFormState {
  type: string;
  title: string;
  sportId: string;
  groupId: string;
  coachId: string;
  venueId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  description: string;
}

interface GenerateResult {
  seriesId: string;
  created: number;
  skipped: Array<{ date: string; reason: string }>;
}

const EMPTY_FORM: SessionFormState = {
  type: 'TRAINING',
  title: '',
  sportId: '',
  groupId: '',
  coachId: '',
  venueId: '',
  sessionDate: '',
  startTime: '17:00',
  endTime: '18:30',
  description: '',
};

const pad = (n: number) => String(n).padStart(2, '0');

/** تاريخ محلي → YYYY-MM-DD. */
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromISODate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** ISO datetime → HH:mm (24h) في منطقة المؤسسة — لحقول الوقت. */
function toHHmm(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 5);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
}

function addDaysLocal(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

/** بداية الأسبوع (الأحد) لتاريخ محلي. */
function startOfWeek(d: Date): Date {
  return addDaysLocal(d, -d.getDay());
}

export function CalendarScreen() {
  const t = useTranslations('calendar');
  const tc = useTranslations('common');
  const tSport = useTranslations('sport');
  const tGroup = useTranslations('group');
  const tCoach = useTranslations('coach');
  const tVenue = useTranslations('venue');
  const tErr = useTranslations('errors');
  const errorText = useErrorText();
  const toast = useToast();
  const router = useRouter();
  const fmt = useFormatters();
  const { can, settings } = useSession();

  const [view, setView] = useState<CalendarView>('month');
  const [anchor, setAnchor] = useState<string>(() => todayFor(settings));
  const [filters, setFilters] = useState<SessionFilters>({
    sportId: '',
    groupId: '',
    coachId: '',
    venueId: '',
    type: '',
  });

  // افتراضيًا: الأجندة على الشاشات الصغيرة
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) setView('agenda');
  }, []);

  const range = useMemo(() => {
    const base = fromISODate(anchor);
    if (view === 'month') {
      const first = new Date(base.getFullYear(), base.getMonth(), 1);
      const gridStart = startOfWeek(first);
      return { from: toISODate(gridStart), to: toISODate(addDaysLocal(gridStart, 41)) };
    }
    if (view === 'week') {
      const start = startOfWeek(base);
      return { from: toISODate(start), to: toISODate(addDaysLocal(start, 6)) };
    }
    return { from: anchor, to: anchor };
  }, [view, anchor]);

  const params = useMemo<QueryParams>(
    () => ({
      from: range.from,
      to: range.to,
      pageSize: 100,
      sort: 'sessionDate,startTime',
      sportId: filters.sportId || undefined,
      groupId: filters.groupId || undefined,
      coachId: filters.coachId || undefined,
      venueId: filters.venueId || undefined,
      type: filters.type || undefined,
    }),
    [range, filters],
  );

  const sessionsApi = useApi<SessionDto[]>(can('sessions.view') ? '/sessions' : null, { params });
  const sports = useApi<SportDto[]>('/sports', { params: { pageSize: 100 } });
  const groups = useApi<GroupDto[]>('/groups', { params: { pageSize: 100 } });
  const coaches = useApi<CoachDto[]>('/coaches', { params: { pageSize: 100 } });
  const venues = useApi<VenueDto[]>('/venues', { params: { pageSize: 100 } });

  const sessions = useMemo(() => sessionsApi.data ?? [], [sessionsApi.data]);

  // ---------- حوار الحصة (إنشاء/تعديل/إلغاء/إعادة جدولة) ----------
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SessionDto | null>(null);
  const [form, setForm] = useState<SessionFormState>(EMPTY_FORM);
  const [applyTo, setApplyTo] = useState<'this' | 'series'>('this');
  const [dialogMode, setDialogMode] = useState<'form' | 'cancel' | 'reschedule'>('form');
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleForm, setRescheduleForm] = useState({ sessionDate: '', startTime: '17:00', endTime: '18:30', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // ---------- توليد الحصص ----------
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState({ groupId: '', fromDate: '', toDate: '' });
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const sportOptions = (sports.data ?? []).map((s) => ({ value: s.id, label: s.name }));
  const groupOptions = (groups.data ?? []).map((g) => ({ value: g.id, label: g.name }));
  const coachOptions = (coaches.data ?? []).map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }));
  const venueOptions = (venues.data ?? []).map((v) => ({ value: v.id, label: v.name }));

  const setField = (name: keyof SessionFormState, value: string) =>
    setForm((f) => ({ ...f, [name]: value }));

  const openCreate = (date?: string) => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, sessionDate: date ?? anchor });
    setApplyTo('this');
    setDialogMode('form');
    setSubmitError(null);
    setConflictMessage(null);
    setFieldErrors({});
    setDialogOpen(true);
  };

  const openEdit = (s: SessionDto) => {
    setEditing(s);
    setForm({
      type: s.type,
      title: s.title,
      sportId: s.sportId ?? '',
      groupId: s.groupId ?? '',
      coachId: s.coachId ?? '',
      venueId: s.venueId ?? '',
      sessionDate: s.sessionDate.slice(0, 10),
      startTime: toHHmm(s.startTime, settings.timezone),
      endTime: toHHmm(s.endTime, settings.timezone),
      description: s.description ?? '',
    });
    setApplyTo('this');
    setDialogMode('form');
    setSubmitError(null);
    setConflictMessage(null);
    setFieldErrors({});
    setCancelReason('');
    setRescheduleForm({
      sessionDate: s.sessionDate.slice(0, 10),
      startTime: '17:00',
      endTime: '18:30',
      reason: '',
    });
    setDialogOpen(true);
  };

  const validateForm = (): string | null => {
    if (form.title.trim().length < 2) return t('sessionTitle');
    if (!form.sessionDate) return t('sessionDate');
    if (!/^\d{2}:\d{2}$/.test(form.startTime) || !/^\d{2}:\d{2}$/.test(form.endTime)) return tc('required');
    if (form.endTime <= form.startTime) return 'endTime';
    return null;
  };

  const submitSession = async () => {
    setSubmitError(null);
    setConflictMessage(null);
    setFieldErrors({});
    if (validateForm()) {
      setSubmitError(tc('required'));
      return;
    }
    const body: Record<string, unknown> = {
      type: form.type,
      title: form.title.trim(),
      sportId: form.sportId || null,
      groupId: form.groupId || null,
      coachId: form.coachId || null,
      venueId: form.venueId || null,
      sessionDate: form.sessionDate,
      startTime: form.startTime,
      endTime: form.endTime,
      description: form.description.trim() || null,
    };
    setSubmitting(true);
    try {
      if (editing) {
        await apiPatch(`/sessions/${editing.id}`, { ...body, version: editing.version, applyTo });
        toast.success(t('editSession'));
      } else {
        await apiPost<SessionDto>('/sessions', body);
        toast.success(t('newSession'));
      }
      setDialogOpen(false);
      sessionsApi.reload();
    } catch (e) {
      if (e instanceof ApiClientError) {
        if (e.code === 'SESSION_CONFLICT') {
          // رسالة الخادم تسمّي المورد المتعارض والحدث المتعارض معه
          setConflictMessage(e.message || tErr('SESSION_CONFLICT'));
        } else if (e.fieldErrors) {
          setFieldErrors(e.fieldErrors);
        } else {
          setSubmitError(errorText(e));
        }
      } else {
        setSubmitError(errorText(e));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitCancel = async () => {
    if (!editing) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiPost(`/sessions/${editing.id}/cancel`, {
        version: editing.version,
        reason: cancelReason.trim(),
      });
      toast.success(t('cancelSession'));
      setDialogOpen(false);
      sessionsApi.reload();
    } catch (e) {
      setSubmitError(errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  const submitReschedule = async () => {
    if (!editing) return;
    setSubmitting(true);
    setSubmitError(null);
    setConflictMessage(null);
    try {
      await apiPost(`/sessions/${editing.id}/reschedule`, {
        version: editing.version,
        sessionDate: rescheduleForm.sessionDate,
        startTime: rescheduleForm.startTime,
        endTime: rescheduleForm.endTime,
        reason: rescheduleForm.reason.trim() || undefined,
      });
      toast.success(t('reschedule'));
      setDialogOpen(false);
      sessionsApi.reload();
    } catch (e) {
      if (e instanceof ApiClientError && e.code === 'SESSION_CONFLICT') {
        setConflictMessage(e.message || tErr('SESSION_CONFLICT'));
      } else {
        setSubmitError(errorText(e));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitGenerate = async () => {
    if (!generateForm.groupId || !generateForm.fromDate) return;
    setGenerating(true);
    setGenerateError(null);
    setGenerateResult(null);
    try {
      const r = await apiPost<GenerateResult>('/sessions/generate', {
        groupId: generateForm.groupId,
        fromDate: generateForm.fromDate,
        toDate: generateForm.toDate || undefined,
      });
      setGenerateResult(r.data);
      sessionsApi.reload();
    } catch (e) {
      setGenerateError(errorText(e));
    } finally {
      setGenerating(false);
    }
  };

  // ---------- العرض ----------

  const sportColor = (s: SessionDto): string | undefined => s.sport?.color ?? undefined;

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, SessionDto[]>();
    for (const s of sessions) {
      const key = s.sessionDate.slice(0, 10);
      const arr = map.get(key);
      if (arr) arr.push(s);
      else map.set(key, [s]);
    }
    return map;
  }, [sessions]);

  const navigate = (dir: -1 | 1) => {
    const base = fromISODate(anchor);
    if (view === 'month') {
      const next = new Date(base.getFullYear(), base.getMonth() + dir, 1);
      setAnchor(toISODate(next));
    } else if (view === 'week') {
      setAnchor(toISODate(addDaysLocal(base, dir * 7)));
    } else {
      setAnchor(toISODate(addDaysLocal(base, dir)));
    }
  };

  const periodTitle = useMemo(() => {
    const base = fromISODate(anchor);
    if (view === 'month') {
      return new Intl.DateTimeFormat(fmt.locale, { month: 'long', year: 'numeric', timeZone: settings.timezone }).format(base);
    }
    if (view === 'week') {
      const start = startOfWeek(base);
      const end = addDaysLocal(start, 6);
      const f = new Intl.DateTimeFormat(fmt.locale, { day: 'numeric', month: 'short', timeZone: settings.timezone });
      return `${f.format(start)} — ${f.format(end)}`;
    }
    return new Intl.DateTimeFormat(fmt.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: settings.timezone }).format(base);
  }, [view, anchor, fmt.locale, settings.timezone]);

  const SessionChip = ({ s, compact }: { s: SessionDto; compact?: boolean }) => (
    <button
      type="button"
      onClick={() => (can('sessions.edit') ? openEdit(s) : undefined)}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-start text-xs transition-colors hover:bg-muted',
        s.status === 'CANCELLED' && 'opacity-60 line-through',
        compact ? 'min-h-8' : 'min-h-touch',
      )}
      title={`${s.title} (${fmt.time(s.startTime)}–${fmt.time(s.endTime)})`}
    >
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: sportColor(s) ?? 'hsl(var(--primary))' }}
      />
      <span className="min-w-0 flex-1 truncate">
        <span className="tabular-nums ltr-field">{toHHmm(s.startTime, settings.timezone)}</span> {s.title}
      </span>
      {s.status !== 'SCHEDULED' ? <StatusBadge value={s.status} className="shrink-0" /> : null}
    </button>
  );

  const renderBody = () => {
    if (!can('sessions.view')) {
      return <EmptyState title={tErr('FORBIDDEN')} />;
    }
    if (sessionsApi.loading) return <Loading label={tc('loading')} />;
    if (sessionsApi.error) return <ErrorState message={errorText(sessionsApi.error)} onRetry={sessionsApi.reload} />;

    if (view === 'month') {
      const gridStart = startOfWeek(new Date(fromISODate(anchor).getFullYear(), fromISODate(anchor).getMonth(), 1));
      const days = Array.from({ length: 42 }, (_, i) => addDaysLocal(gridStart, i));
      const today = todayFor(settings);
      const monthOfAnchor = fromISODate(anchor).getMonth();
      return (
        <div className="card p-2">
          <div className="grid grid-cols-7 gap-1">
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => (
              <div key={d} className="pb-1 text-center text-[11px] font-semibold text-muted-foreground">
                <DayName day={d} />
              </div>
            ))}
            {days.map((day) => {
              const iso = toISODate(day);
              const daySessions = sessionsByDate.get(iso) ?? [];
              const isToday = iso === today;
              const inMonth = day.getMonth() === monthOfAnchor;
              return (
                <div
                  key={iso}
                  className={cn(
                    'min-h-24 rounded-lg border p-1 sm:min-h-28',
                    inMonth ? 'border-border bg-card' : 'border-transparent bg-muted/30',
                    isToday && 'border-primary ring-1 ring-primary',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setAnchor(iso);
                        setView('day');
                      }}
                      className={cn(
                        'rounded px-1 text-xs font-bold tabular-nums hover:bg-muted',
                        isToday && 'bg-primary text-primary-foreground hover:bg-primary',
                      )}
                    >
                      {fmt.number(day.getDate())}
                    </button>
                    {can('sessions.create') ? (
                      <button
                        type="button"
                        aria-label={t('newSession')}
                        onClick={() => openCreate(iso)}
                        className="hidden rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-primary sm:block"
                      >
                        <Plus className="size-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    {daySessions.slice(0, 3).map((s) => (
                      <SessionChip key={s.id} s={s} compact />
                    ))}
                    {daySessions.length > 3 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAnchor(iso);
                          setView('day');
                        }}
                        className="w-full rounded px-1 text-start text-[11px] text-primary hover:underline"
                      >
                        {t('moreSessions', { count: daySessions.length - 3 })}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (view === 'week') {
      const start = startOfWeek(fromISODate(anchor));
      const days = Array.from({ length: 7 }, (_, i) => addDaysLocal(start, i));
      const today = todayFor(settings);
      return (
        <div className="card grid grid-cols-1 gap-2 p-2 sm:grid-cols-7">
          {days.map((day) => {
            const iso = toISODate(day);
            const daySessions = sessionsByDate.get(iso) ?? [];
            return (
              <div
                key={iso}
                className={cn('rounded-lg border border-border p-1.5', iso === today && 'border-primary ring-1 ring-primary')}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-bold">
                    <DayName day={['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][day.getDay()] ?? 'SUN'} />{' '}
                    <span className="tabular-nums">{fmt.number(day.getDate())}</span>
                  </span>
                  {can('sessions.create') ? (
                    <button
                      type="button"
                      aria-label={t('newSession')}
                      onClick={() => openCreate(iso)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-primary"
                    >
                      <Plus className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
                <div className="space-y-1">
                  {daySessions.length === 0 ? (
                    <p className="px-1 py-2 text-center text-[11px] text-muted-foreground">{t('noSessions')}</p>
                  ) : (
                    daySessions.map((s) => <SessionChip key={s.id} s={s} compact />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (view === 'day') {
      const daySessions = sessionsByDate.get(anchor) ?? [];
      return (
        <div className="card space-y-2 p-3">
          {daySessions.length === 0 ? (
            <EmptyState
              title={t('noSessions')}
              icon={<CalendarDays className="size-6" aria-hidden />}
              action={
                can('sessions.create') ? (
                  <Button type="button" size="sm" onClick={() => openCreate(anchor)}>
                    <Plus className="size-4" aria-hidden />
                    {t('newSession')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            daySessions.map((s) => <SessionRow key={s.id} s={s} onOpen={() => openEdit(s)} canEdit={can('sessions.edit')} />)
          )}
        </div>
      );
    }

    // agenda — قائمة مسطحة مجمّعة حسب التاريخ (محسّنة للموبايل)
    const dates = [...sessionsByDate.keys()].sort();
    if (dates.length === 0) {
      return (
        <div className="card p-0">
          <EmptyState
            title={t('noSessions')}
            icon={<CalendarDays className="size-6" aria-hidden />}
            action={
              can('sessions.create') ? (
                <Button type="button" size="sm" onClick={() => openCreate()}>
                  <Plus className="size-4" aria-hidden />
                  {t('newSession')}
                </Button>
              ) : undefined
            }
          />
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {dates.map((iso) => (
          <div key={iso} className="card p-3">
            <p className="mb-2 text-sm font-bold text-muted-foreground">{fmt.date(iso)}</p>
            <div className="space-y-1.5">
              {(sessionsByDate.get(iso) ?? []).map((s) => (
                <SessionRow key={s.id} s={s} onOpen={() => openEdit(s)} canEdit={can('sessions.edit')} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  function SessionRow({ s, onOpen, canEdit }: { s: SessionDto; onOpen: () => void; canEdit: boolean }) {
    return (
      <button
        type="button"
        onClick={canEdit ? onOpen : undefined}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border border-border bg-card p-2.5 text-start transition-colors',
          canEdit && 'hover:bg-muted',
          s.status === 'CANCELLED' && 'opacity-60',
        )}
      >
        <span
          aria-hidden
          className="h-10 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: sportColor(s) ?? 'hsl(var(--primary))' }}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{s.title}</span>
            <Badge label={t(`types.${s.type}`)} tone="muted" />
            {s.status !== 'SCHEDULED' ? <StatusBadge value={s.status} /> : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            <span className="ltr-field tabular-nums">
              {toHHmm(s.startTime, settings.timezone)}–{toHHmm(s.endTime, settings.timezone)}
            </span>
            {s.group ? ` · ${s.group.name}` : ''}
            {s.coach ? ` · ${s.coach.firstName} ${s.coach.lastName}` : ''}
            {s.venue ? ` · ${s.venue.name}` : ''}
          </span>
        </span>
        {canEdit ? <Pencil className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
      </button>
    );
  }

  function DayName({ day }: { day: string }) {
    const td = useTranslations('days');
    return <>{td(day)}</>;
  }

  const dialogTitle =
    dialogMode === 'cancel'
      ? t('cancelSession')
      : dialogMode === 'reschedule'
        ? t('reschedule')
        : editing
          ? t('editSession')
          : t('newSession');

  return (
    <div>
      <PageHeader
        title={t('title')}
        actions={
          <>
            {can('sessions.create') ? (
              <Button type="button" variant="outline" onClick={() => {
                setGenerateForm({ groupId: '', fromDate: todayFor(settings), toDate: '' });
                setGenerateResult(null);
                setGenerateError(null);
                setGenerateOpen(true);
              }}>
                <Repeat className="size-4" aria-hidden />
                {t('generate')}
              </Button>
            ) : null}
            {can('sessions.create') ? (
              <Button type="button" onClick={() => openCreate()}>
                <Plus className="size-4" aria-hidden />
                {t('newSession')}
              </Button>
            ) : null}
          </>
        }
      />

      {/* شريط العرض والتنقل والمرشحات */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label={t('title')}>
          <Button type="button" variant="outline" size="icon-sm" aria-label={tc('previous')} onClick={() => navigate(-1)}>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAnchor(todayFor(settings))}>
            {tc('today')}
          </Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label={tc('next')} onClick={() => navigate(1)}>
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
        </div>
        <span className="min-w-40 text-sm font-bold">{periodTitle}</span>
        <div className="flex overflow-hidden rounded-lg border border-border" role="tablist" aria-label={t('title')}>
          {(['month', 'week', 'day', 'agenda'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                'min-h-9 px-3 text-xs font-medium transition-colors',
                view === v ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted',
              )}
            >
              {t(v)}
            </button>
          ))}
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <div className="w-40">
            <Select
              aria-label={t('sessionType')}
              value={filters.type}
              placeholder={`${tc('all')} — ${t('sessionType')}`}
              options={SESSION_TYPES.map((v) => ({ value: v, label: t(`types.${v}`) }))}
              onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Select
          aria-label={tSport('title')}
          value={filters.sportId}
          placeholder={`${tc('all')} — ${tSport('title')}`}
          options={sportOptions}
          onChange={(e) => setFilters((f) => ({ ...f, sportId: e.target.value }))}
        />
        <Select
          aria-label={tGroup('title')}
          value={filters.groupId}
          placeholder={`${tc('all')} — ${tGroup('title')}`}
          options={groupOptions}
          onChange={(e) => setFilters((f) => ({ ...f, groupId: e.target.value }))}
        />
        <Select
          aria-label={tCoach('title')}
          value={filters.coachId}
          placeholder={`${tc('all')} — ${tCoach('title')}`}
          options={coachOptions}
          onChange={(e) => setFilters((f) => ({ ...f, coachId: e.target.value }))}
        />
        <Select
          aria-label={tVenue('title')}
          value={filters.venueId}
          placeholder={`${tc('all')} — ${tVenue('title')}`}
          options={venueOptions}
          onChange={(e) => setFilters((f) => ({ ...f, venueId: e.target.value }))}
        />
      </div>

      {renderBody()}

      {/* حوار الحصة */}
      <Modal
        open={dialogOpen}
        onOpenChange={(o) => !submitting && setDialogOpen(o)}
        title={dialogTitle}
        size="lg"
        footer={
          dialogMode === 'form' ? (
            <>
              {editing && can('sessions.edit') ? (
                <div className="me-auto flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive"
                    disabled={editing.status === 'CANCELLED'}
                    onClick={() => {
                      setDialogMode('cancel');
                      setSubmitError(null);
                    }}
                  >
                    <XCircle className="size-4" aria-hidden />
                    {t('cancelSession')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={editing.status === 'CANCELLED'}
                    onClick={() => {
                      setDialogMode('reschedule');
                      setSubmitError(null);
                      setConflictMessage(null);
                    }}
                  >
                    <CalendarClock className="size-4" aria-hidden />
                    {t('reschedule')}
                  </Button>
                </div>
              ) : null}
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                {tc('cancel')}
              </Button>
              <Button type="button" onClick={() => void submitSession()} loading={submitting}>
                {tc('save')}
              </Button>
            </>
          ) : dialogMode === 'cancel' ? (
            <>
              <Button type="button" variant="outline" onClick={() => setDialogMode('form')} disabled={submitting}>
                {tc('back')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void submitCancel()}
                loading={submitting}
                disabled={cancelReason.trim().length < 5}
              >
                {t('cancelSession')}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setDialogMode('form')} disabled={submitting}>
                {tc('back')}
              </Button>
              <Button type="button" onClick={() => void submitReschedule()} loading={submitting}>
                {t('reschedule')}
              </Button>
            </>
          )
        }
      >
        {conflictMessage ? (
          <div
            role="alert"
            className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <p className="font-bold">{tErr('SESSION_CONFLICT')}</p>
            <p className="mt-1">{conflictMessage}</p>
          </div>
        ) : null}
        {submitError ? (
          <div className="mb-3">
            <ErrorText message={submitError} />
          </div>
        ) : null}

        {dialogMode === 'form' ? (
          <form
            id="session-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submitSession();
            }}
            noValidate
          >
            <FormGrid>
              <Field label={t('sessionTitle')} htmlFor="s-title" required error={fieldErrors.title?.[0]}>
                <Input
                  id="s-title"
                  value={form.title}
                  onChange={(e) => setField('title', e.target.value)}
                  invalid={Boolean(fieldErrors.title)}
                />
              </Field>
              <Field label={t('sessionType')} htmlFor="s-type">
                <Select
                  id="s-type"
                  value={form.type}
                  options={SESSION_TYPES.map((v) => ({ value: v, label: t(`types.${v}`) }))}
                  onChange={(e) => setField('type', e.target.value)}
                />
              </Field>
              <Field label={t('sessionDate')} htmlFor="s-date" required error={fieldErrors.sessionDate?.[0]}>
                <DatePicker
                  id="s-date"
                  value={form.sessionDate}
                  onChange={(e) => setField('sessionDate', e.target.value)}
                  invalid={Boolean(fieldErrors.sessionDate)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={tc('from')} htmlFor="s-start" required error={fieldErrors.startTime?.[0]}>
                  <TimePicker
                    id="s-start"
                    value={form.startTime}
                    onChange={(e) => setField('startTime', e.target.value)}
                    invalid={Boolean(fieldErrors.startTime)}
                  />
                </Field>
                <Field label={tc('to')} htmlFor="s-end" required error={fieldErrors.endTime?.[0]}>
                  <TimePicker
                    id="s-end"
                    value={form.endTime}
                    onChange={(e) => setField('endTime', e.target.value)}
                    invalid={Boolean(fieldErrors.endTime)}
                  />
                </Field>
              </div>
              <Field label={tSport('title')} htmlFor="s-sport">
                <Select
                  id="s-sport"
                  value={form.sportId}
                  placeholder={tc('none')}
                  options={sportOptions}
                  onChange={(e) => setField('sportId', e.target.value)}
                />
              </Field>
              <Field label={tGroup('title')} htmlFor="s-group">
                <Select
                  id="s-group"
                  value={form.groupId}
                  placeholder={tc('none')}
                  options={groupOptions}
                  onChange={(e) => setField('groupId', e.target.value)}
                />
              </Field>
              <Field label={tCoach('title')} htmlFor="s-coach">
                <Select
                  id="s-coach"
                  value={form.coachId}
                  placeholder={tc('none')}
                  options={coachOptions}
                  onChange={(e) => setField('coachId', e.target.value)}
                />
              </Field>
              <Field label={tVenue('title')} htmlFor="s-venue">
                <Select
                  id="s-venue"
                  value={form.venueId}
                  placeholder={tc('none')}
                  options={venueOptions}
                  onChange={(e) => setField('venueId', e.target.value)}
                />
              </Field>
              {editing?.seriesId ? (
                <Field label={t('applyTo')} className="sm:col-span-2">
                  <div className="flex gap-4">
                    <label className="inline-flex min-h-touch cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="applyTo"
                        className="size-4 accent-[hsl(var(--primary))]"
                        checked={applyTo === 'this'}
                        onChange={() => setApplyTo('this')}
                      />
                      {t('thisOnly')}
                    </label>
                    <label className="inline-flex min-h-touch cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="applyTo"
                        className="size-4 accent-[hsl(var(--primary))]"
                        checked={applyTo === 'series'}
                        onChange={() => setApplyTo('series')}
                      />
                      {t('wholeSeries')}
                    </label>
                  </div>
                </Field>
              ) : null}
              <Field label={tc('notes')} htmlFor="s-desc" className="sm:col-span-2">
                <Textarea
                  id="s-desc"
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                />
              </Field>
            </FormGrid>
          </form>
        ) : dialogMode === 'cancel' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('cancelSession')} — {editing?.title}</p>
            <Field label={t('cancelReason')} htmlFor="cancel-reason" required>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                invalid={cancelReason.trim().length > 0 && cancelReason.trim().length < 5}
              />
            </Field>
          </div>
        ) : (
          <div className="space-y-3">
            <FormGrid>
              <Field label={t('rescheduleTo')} htmlFor="r-date" required>
                <DatePicker
                  id="r-date"
                  value={rescheduleForm.sessionDate}
                  onChange={(e) => setRescheduleForm((f) => ({ ...f, sessionDate: e.target.value }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={tc('from')} htmlFor="r-start" required>
                  <TimePicker
                    id="r-start"
                    value={rescheduleForm.startTime}
                    onChange={(e) => setRescheduleForm((f) => ({ ...f, startTime: e.target.value }))}
                  />
                </Field>
                <Field label={tc('to')} htmlFor="r-end" required>
                  <TimePicker
                    id="r-end"
                    value={rescheduleForm.endTime}
                    onChange={(e) => setRescheduleForm((f) => ({ ...f, endTime: e.target.value }))}
                  />
                </Field>
              </div>
              <Field label={tc('reason')} htmlFor="r-reason" className="sm:col-span-2" optional>
                <Textarea
                  id="r-reason"
                  value={rescheduleForm.reason}
                  onChange={(e) => setRescheduleForm((f) => ({ ...f, reason: e.target.value }))}
                />
              </Field>
            </FormGrid>
          </div>
        )}
      </Modal>

      {/* حوار توليد الحصص */}
      <Modal
        open={generateOpen}
        onOpenChange={(o) => !generating && setGenerateOpen(o)}
        title={t('generateTitle')}
        description={t('generateHint')}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setGenerateOpen(false)} disabled={generating}>
              {tc('close')}
            </Button>
            <Button
              type="button"
              onClick={() => void submitGenerate()}
              loading={generating}
              disabled={!generateForm.groupId || !generateForm.fromDate}
            >
              {t('generate')}
            </Button>
          </>
        }
      >
        {generateError ? (
          <div className="mb-3">
            <ErrorText message={generateError} />
          </div>
        ) : null}
        {generateResult ? (
          <div className="mb-3 rounded-lg border border-success/40 bg-success/10 p-3 text-sm" role="status">
            <p className="font-bold text-success">{t('generateCreated', { count: generateResult.created })}</p>
            {generateResult.skipped.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {generateResult.skipped.map((sk) => (
                  <li key={sk.date}>
                    <span className="ltr-field tabular-nums">{sk.date}</span> — {sk.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <FormGrid>
          <Field label={tGroup('title')} htmlFor="g-group" required>
            <Select
              id="g-group"
              value={generateForm.groupId}
              placeholder={tGroup('title')}
              options={groupOptions}
              onChange={(e) => setGenerateForm((f) => ({ ...f, groupId: e.target.value }))}
            />
          </Field>
          <Field label={tc('from')} htmlFor="g-from" required>
            <DatePicker
              id="g-from"
              value={generateForm.fromDate}
              onChange={(e) => setGenerateForm((f) => ({ ...f, fromDate: e.target.value }))}
            />
          </Field>
          <Field label={t('generateUntil')} htmlFor="g-to" className="sm:col-span-2" optional>
            <DatePicker
              id="g-to"
              value={generateForm.toDate}
              onChange={(e) => setGenerateForm((f) => ({ ...f, toDate: e.target.value }))}
            />
          </Field>
        </FormGrid>
      </Modal>

      {/* تأكيد الخروج بلا حفظ غير مطلوب — الإغلاق مباشر */}
      <ConfirmDialog
        open={false}
        onOpenChange={() => undefined}
        title=""
        message=""
        onConfirm={() => undefined}
      />
      <span className="hidden">{ts('SCHEDULED')}</span>
      <button type="button" className="hidden" onClick={() => router.push('/attendance')} aria-hidden tabIndex={-1} />
    </div>
  );
}
