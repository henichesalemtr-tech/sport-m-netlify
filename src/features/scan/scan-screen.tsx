'use client';

/**
 * شاشة المسح — معاينة كاميرا + كشف باركود (BarcodeDetector عند توفره) وإدخال يدوي،
 * مع منع التكرار (scan.dedupSeconds) وإرسال رمز واحد لكل عملية (Idempotency-Key)
 * لعرض بطاقة الرياضي (الاشتراك/الدفع/الحضور/التنبيهات). كل عملية تستدعي POST /scan.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  RotateCcw,
  UserCheck,
} from 'lucide-react';
import type { AttendanceStatusName, ScanCard, SessionDto } from '@/shared/api/types';
import { apiPost, newIdempotencyKey } from '@/shared/api/client';
import { useApi, useErrorText } from '@/shared/hooks/useApi';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { tr } from '@/features/common/tr';
import { todayFor } from '@/shared/lib/format';
import { PageHeader } from '@/shared/ui-kit/page-header';
import { Button } from '@/shared/ui-kit/button';
import { Input } from '@/shared/ui-kit/input';
import { Select } from '@/shared/ui-kit/select';
import { Card } from '@/shared/ui-kit/card';
import { StatusBadge } from '@/shared/ui-kit/status-badge';
import { EmptyState } from '@/shared/ui-kit/empty-state';
import { Field } from '@/shared/ui-kit/form';
import { useToast } from '@/shared/ui-kit/toast';
import { cn } from '@/shared/ui-kit/utils';

interface ScanInput {
  code: string;
  sessionId?: string;
}

interface DetectedBarcode {
  rawValue?: string;
}

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
}

type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

interface RecentScan {
  key: string;
  code: string;
  label: string;
  ok: boolean;
}

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

const STATUS_AR: Record<AttendanceStatusName, string> = {
  PRESENT: 'حاضر',
  ABSENT: 'غائب',
  LATE: 'متأخر',
  EXCUSED: 'غياب مبرر',
};

export function ScanScreen() {
  const t = useTranslations('scan');
  const errorText = useErrorText();
  const toast = useToast();
  const fmt = useFormatters();
  const { can, settings } = useSession();

  const canScan = can('attendance.create');
  const canSessions = can('sessions.view');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const loopRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const cameraOnRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const dedupRef = useRef<{ code: string; ts: number } | null>(null);

  const [manualCode, setManualCode] = useState('');
  const [targetSession, setTargetSession] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [autoDetect, setAutoDetect] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraUnsupported, setCameraUnsupported] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanCard | null>(null);
  const [notice, setNotice] = useState<'success' | 'warn' | 'duplicate' | 'error' | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);

  const today = useMemo(() => todayFor(settings), [settings]);
  const sessionsApi = useApi<SessionDto[]>(canSessions ? '/sessions' : null, {
    params: useMemo(() => ({ from: today, to: today, pageSize: 100, sort: 'startTime' }), [today]),
  });
  const sessionOptions = useMemo(
    () =>
      (sessionsApi.data ?? []).map((s) => ({
        value: s.id,
        label: `${s.title} — ${fmt.time(s.startTime)}`,
      })),
    [sessionsApi.data, fmt],
  );

  const beep = useCallback((ok: boolean) => {
    try {
      const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return;
      const ctx = audioRef.current ?? new Ctor();
      audioRef.current = ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = ok ? 'sine' : 'square';
      osc.frequency.value = ok ? 880 : 200;
      const dur = ok ? 0.16 : 0.3;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch {
      // صوت غير متاح — نتجاهل بهدوء
    }
  }, []);

  const stopLoop = useCallback(() => {
    if (loopRef.current !== null) {
      window.clearTimeout(loopRef.current);
      loopRef.current = null;
    }
  }, []);

  const submitScan = useCallback(
    async (rawCode: string): Promise<void> => {
      const code = rawCode.trim();
      setScanError(null);
      if (code.length < 8) {
        setNotice('error');
        toast.error(tr(t, 'unknownCode', 'رمز غير صالح'));
        beep(false);
        return;
      }
      const dedupMs = (settings.scanDedupSeconds ?? 0) * 1000;
      const last = dedupRef.current;
      if (dedupMs > 0 && last && last.code === code && Date.now() - last.ts < dedupMs) {
        setNotice('duplicate');
        toast.info(tr(t, 'duplicateScan', 'مسح مكرر — سُجّل هذا الرياضي حديثًا'));
        beep(false);
        return;
      }
      dedupRef.current = { code, ts: Date.now() };

      if (processingRef.current) return;
      processingRef.current = true;
      setProcessing(true);
      const body: ScanInput = { code, ...(targetSession !== '' ? { sessionId: targetSession } : {}) };
      try {
        const res = await apiPost<ScanCard>('/scan', body, { idempotencyKey: newIdempotencyKey() });
        const card = res.data;
        setResult(card);
        const athleteLabel = card?.athlete?.fullName ?? code;
        setRecent((prev) =>
          [{ key: `${Date.now()}`, code, label: athleteLabel, ok: !card?.duplicate }, ...prev].slice(0, 8),
        );
        if (card?.duplicate) {
          setNotice('duplicate');
          toast.info(tr(t, 'duplicateScan', 'مسح مكرر'));
          beep(false);
        } else if (card && card.warnings.length > 0) {
          setNotice('warn');
          toast.info(tr(t, 'resultWarn', 'سُجّل الحضور مع تنبيه'));
          beep(true);
        } else {
          setNotice('success');
          toast.success(tr(t, 'resultSuccess', 'تم تسجيل الحضور'));
          beep(true);
        }
      } catch (e) {
        setResult(null);
        setNotice('error');
        const msg = errorText(e);
        setScanError(msg);
        toast.error(msg);
        beep(false);
      } finally {
        processingRef.current = false;
        setProcessing(false);
      }
    },
    [settings.scanDedupSeconds, targetSession, beep, errorText, t, toast],
  );

  const submitRef = useRef(submitScan);
  useEffect(() => {
    submitRef.current = submitScan;
  }, [submitScan]);

  const startLoop = useCallback(() => {
    stopLoop();
    const step = async (): Promise<void> => {
      if (!cameraOnRef.current) {
        loopRef.current = null;
        return;
      }
      const detector = detectorRef.current;
      const video = videoRef.current;
      if (detector && video && !processingRef.current) {
        try {
          const codes = await detector.detect(video);
          const raw = codes[0]?.rawValue?.trim();
          if (raw && raw.length >= 8) {
            stopLoop();
            await submitRef.current(raw);
            return;
          }
        } catch {
          // خطأ إطار — نعاود في الدورة التالية
        }
      }
      loopRef.current = window.setTimeout(() => void step(), 450);
    };
    void step();
  }, [stopLoop]);

  const stopCamera = useCallback(() => {
    cameraOnRef.current = false;
    stopLoop();
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    streamRef.current = null;
    detectorRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setCameraOn(false);
    setAutoDetect(false);
  }, [stopLoop]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setScanError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setCameraUnsupported(true);
      return;
    }
    setCameraUnsupported(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      cameraOnRef.current = true;
      setCameraOn(true);
      const Ctor = getBarcodeDetectorCtor();
      if (Ctor) {
        try {
          detectorRef.current = new Ctor({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13'] });
          setAutoDetect(true);
        } catch {
          detectorRef.current = null;
          setAutoDetect(false);
        }
      } else {
        detectorRef.current = null;
        setAutoDetect(false);
      }
      startLoop();
    } catch (e) {
      setCameraError(e instanceof Error ? e.message : tr(t, 'cameraError', 'تعذر تشغيل الكاميرا، تحقق من الأذونات'));
    }
  }, [startLoop, t]);

  useEffect(() => {
    return () => {
      cameraOnRef.current = false;
      stopLoop();
      const stream = streamRef.current;
      if (stream) for (const track of stream.getTracks()) track.stop();
      const ctx = audioRef.current;
      if (ctx) void ctx.close().catch(() => undefined);
    };
  }, [stopLoop]);

  const onManualSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      void submitScan(manualCode);
    },
    [manualCode, submitScan],
  );

  const scanAgain = useCallback(() => {
    setResult(null);
    setNotice(null);
    setManualCode('');
    dedupRef.current = null;
    if (cameraOnRef.current && detectorRef.current) startLoop();
  }, [startLoop]);

  if (!canScan) {
    return (
      <div>
        <PageHeader title={t('title')} />
        <div className="card p-0">
          <EmptyState title={tr(t, 'noAccess', 'لا تملك صلاحية تسجيل الحضور بالمسح')} icon={<UserCheck className="size-6" aria-hidden />} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t('title')} subtitle={tr(t, 'subtitle', 'امسح رمز البطاقة أو أدخله يدويًا لتسجيل الحضور فورًا')} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* الكاميرا / اليدوي */}
        <Card className="space-y-3">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className={cn('size-full object-cover', !cameraOn && 'opacity-0')}
              aria-label={t('title')}
            />
            {!cameraOn ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/80">
                <QrCode className="size-10" aria-hidden />
                <span>{tr(t, 'startCamera', 'تشغيل الكاميرا')} — {tr(t, 'cameraUnsupported', 'أو استخدم الإدخال اليدوي')}</span>
              </div>
            ) : !autoDetect ? (
              <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-center text-xs text-white">
                {tr(t, 'cameraUnsupported', 'الكشف التلقائي غير مدعوم — استخدم الإدخال اليدوي')}
              </div>
            ) : null}
            {processing ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white" role="status">
                {tr(t, 'scanning', 'جارٍ المعالجة...')}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {cameraOn ? (
              <Button type="button" variant="destructive" size="sm" onClick={stopCamera}>
                <CameraOff className="size-4" aria-hidden />
                {tr(t, 'stopCamera', 'إيقاف الكاميرا')}
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => void startCamera()}>
                <Camera className="size-4" aria-hidden />
                {tr(t, 'startCamera', 'تشغيل الكاميرا')}
              </Button>
            )}
            {cameraUnsupported ? (
              <p className="text-xs text-destructive">{tr(t, 'cameraUnsupported', 'الكاميرا غير مدعومة في هذا المتصفح')}</p>
            ) : null}
            {cameraError ? <p className="text-xs text-destructive">{tr(t, 'cameraError', 'تعذر تشغيل الكاميرا')}: {cameraError}</p> : null}
          </div>

          <form onSubmit={onManualSubmit} className="space-y-2">
            <Field label={tr(t, 'manualEntry', 'إدخال يدوي')} htmlFor="scan-code">
              <Input
                id="scan-code"
                ltr
                autoComplete="off"
                dir="ltr"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder={tr(t, 'inputPlaceholder', 'امسح الرمز أو أدخله هنا...')}
              />
            </Field>
            {canSessions && sessionOptions.length > 0 ? (
              <Field label={tr(t, 'selectSession', 'الحصة المستهدفة (اختياري)')} htmlFor="scan-session">
                <Select
                  id="scan-session"
                  value={targetSession}
                  placeholder={tr(t, 'todaySession', 'حصة اليوم التلقائية')}
                  options={sessionOptions}
                  onChange={(e) => setTargetSession(e.target.value)}
                />
              </Field>
            ) : null}
            <Button type="submit" disabled={processing || manualCode.trim().length < 8}>
              <QrCode className="size-4" aria-hidden />
              {tr(t, 'resultSuccess', 'تسجيل الحضور')}
            </Button>
          </form>

          {recent.length > 0 ? (
            <div className="border-t border-border pt-2">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">{tr(t, 'recentScans', 'عمليات المسح الأخيرة')}</p>
              <ul className="space-y-1">
                {recent.map((r) => (
                  <li key={r.key} className="flex items-center justify-between gap-2 text-xs">
                    <span className="ltr-field truncate font-mono text-muted-foreground">{r.code.slice(0, 12)}…</span>
                    <span className={cn('truncate', r.ok ? 'text-success' : 'text-warning')}>{r.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        {/* النتيجة */}
        <Card className="space-y-3">
          {notice ? <NoticeBanner kind={notice} /> : null}
          {scanError ? <p role="alert" className="text-sm text-destructive">{scanError}</p> : null}
          {result ? (
            <ScanResultCard card={result} fmt={fmt} />
          ) : (
            <EmptyState title={tr(t, 'inputPlaceholder', 'امسح رمز البطاقة لعرض البطاقة')} icon={<QrCode className="size-6" aria-hidden />} />
          )}
          {result ? (
            <Button type="button" variant="outline" size="sm" onClick={scanAgain}>
              <RotateCcw className="size-4" aria-hidden />
              {tr(t, 'scanAgain', 'مسح جديد')}
            </Button>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function NoticeBanner({ kind }: { kind: 'success' | 'warn' | 'duplicate' | 'error' }) {
  const t = useTranslations('scan');
  const map = {
    success: { cls: 'border-success/40 bg-success/10 text-success', text: tr(t, 'resultSuccess', 'تم تسجيل الحضور') },
    warn: { cls: 'border-warning/40 bg-warning/10 text-warning', text: tr(t, 'resultWarn', 'سُجّل الحضور مع تنبيه') },
    duplicate: { cls: 'border-accent/40 bg-accent/10 text-foreground', text: tr(t, 'duplicateScan', 'مسح مكرر') },
    error: { cls: 'border-destructive/40 bg-destructive/10 text-destructive', text: tr(t, 'resultReject', 'رُفض المسح') },
  } as const;
  const v = map[kind];
  return (
    <div role="status" className={cn('flex items-center gap-2 rounded-lg border p-2.5 text-sm', v.cls)}>
      {kind === 'error' || kind === 'warn' ? <AlertTriangle className="size-4" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
      {v.text}
    </div>
  );
}

interface ScanResultCardProps {
  card: ScanCard;
  fmt: ReturnType<typeof useFormatters>;
}

function ScanResultCard({ card, fmt }: ScanResultCardProps) {
  const t = useTranslations('scan');
  const statusOf = card.athlete.status;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
          {card.athlete.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.athlete.photoUrl} alt={card.athlete.fullName} className="size-full object-cover" />
          ) : (
            <UserCheck className="size-7 text-muted-foreground" aria-hidden />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold">{card.athlete.fullName}</p>
          <p className="ltr-field font-mono text-xs text-muted-foreground">{card.athlete.registrationNo}</p>
          <StatusBadge value={statusOf} />
        </div>
      </div>

      {card.groups.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {card.groups.map((g) => (
            <span key={g.id} className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs">
              {g.name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border border-border p-2">
          <p className="text-xs text-muted-foreground">{tr(t, 'subscriptionState', 'حالة الاشتراك')}</p>
          {card.subscription ? (
            <>
              <StatusBadge value={card.subscription.status} />
              <p className="mt-1 text-xs">{card.subscription.typeName}</p>
              <p className="text-xs text-muted-foreground">
                {fmt.date(card.subscription.endDate)}
              </p>
              <p className="mt-1 text-xs">
                {tr(t, 'remaining', 'المتبقي')}: <span className="tabular-nums">{fmt.money(card.subscription.remainingAmount)}</span>
              </p>
              {card.subscription.sessionsTotal !== null ? (
                <p className="text-xs text-muted-foreground">
                  {tr(t, 'sessionsUsed', 'الحصص المستخدمة')}: {card.subscription.sessionsUsed}/{card.subscription.sessionsTotal}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{tr(t, 'expiredSubscription', 'لا اشتراك')}</p>
          )}
        </div>

        <div className="rounded-lg border border-border p-2">
          <p className="text-xs text-muted-foreground">{tr(t, 'paymentStateLabel', 'حالة الدفع')}</p>
          {card.payment ? (
            <>
              <StatusBadge
                value={card.payment.state}
                label={tr(t, `paymentState.${card.payment.state}`, card.payment.state)}
                tone={card.payment.state === 'PAID' ? 'success' : card.payment.state === 'PARTIAL' ? 'warning' : 'destructive'}
              />
              <p className="mt-1 text-xs">
                {tr(t, 'remaining', 'المتبقي')}: <span className="tabular-nums">{fmt.money(card.payment.remaining)}</span>
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">—</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border p-2 text-sm">
        <p className="text-xs text-muted-foreground">{tr(t, 'attendance', 'الحضور')}</p>
        {card.attendance ? (
          <StatusBadge
            value={card.attendance.status}
            label={
              ((STATUS_AR as Record<string, string>)[card.attendance.status] ??
                card.attendance.status)
            }
          />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {card.session ? <p className="mt-1 text-xs text-muted-foreground">{card.session.title}</p> : null}
      </div>

      {card.warnings.length > 0 ? (
        <ul className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning">
          {card.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
