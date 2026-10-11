import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { getSession } from '@/shared/auth/session';
import { resolvePermissions } from '@/shared/permissions/guard';
import { defaultLocale } from '@/shared/i18n/request';
import { formatDate } from '@/shared/dates';
import { getSettings } from '@/modules/settings/service';
import { athleteService } from '@/modules/athletes/service';
import { subscriptionService } from '@/modules/subscriptions/service';
import { StatusBadge } from '@/shared/ui-kit/status-badge';
import { PrintTrigger } from './print-trigger';

export const dynamic = 'force-dynamic';

/** بطاقة رياضي قابلة للطباعة — تُعرض بحجم بطاقة عضوية (85.6×54 مم). */
export default async function AthleteCardPrintPage({
  params: { locale, athleteId },
}: {
  params: { locale: string; athleteId: string };
}) {
  const session = await getSession();
  const prefix = locale === defaultLocale ? '' : `/${locale}`;
  if (!session) {
    redirect(`${prefix}/login`);
  }

  const permissions = await resolvePermissions(session.role);
  if (!permissions.has('athletes.view')) notFound();

  const [t, tCommon, tAthlete, settings] = await Promise.all([
    getTranslations('print'),
    getTranslations('common'),
    getTranslations('athlete'),
    getSettings(),
  ]);

  const athlete = await athleteService.getById(athleteId, session, {
    user: session,
    requestId: randomUUID(),
    userAgent: 'athlete-card-print',
  });

  const { items: subscriptions } = await subscriptionService.list({ page: 1, pageSize: 5, athleteId });
  const today = new Date();
  const current =
    subscriptions.find((s) => s.status === 'ACTIVE' && s.endDate >= today) ?? subscriptions[0] ?? null;

  const orgName = settings.orgName || tCommon('appName');
  const canViewSensitive = permissions.has('athletes.view_sensitive');

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="print-hide mx-auto mb-6 flex max-w-[340px] items-center justify-between gap-2">
        <a href={`${prefix}/athletes/${athlete.id}`} className="text-sm text-primary hover:underline">
          {tCommon('back')}
        </a>
        <PrintTrigger label={tCommon('print')} />
      </div>

      <div className="print-area mx-auto w-[340px] rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <p className="truncate text-sm font-bold">{orgName}</p>
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{t('athleteCard')}</span>
        </div>

        <div className="mt-3 flex items-start gap-3">
          {athlete.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={athlete.photoUrl}
              alt=""
              className="size-16 shrink-0 rounded-lg border border-slate-200 object-cover"
            />
          ) : (
            <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg font-bold text-primary">
              {athlete.firstName[0]}
              {athlete.lastName[0]}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-bold">
              {athlete.firstName} {athlete.lastName}
            </p>
            <p className="text-xs text-muted-foreground">
              {tAthlete('registrationNo')}: {athlete.registrationNo}
            </p>
            <div className="mt-1">
              <StatusBadge value={athlete.status} />
            </div>
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {athlete.sport ? (
            <Field label={tAthlete('sport')} value={athlete.sport.name} />
          ) : null}
          {athlete.ageCategory ? (
            <Field label={tAthlete('ageCategory')} value={athlete.ageCategory.name} />
          ) : null}
          {current?.groupName ? <Field label={t('group')} value={current.groupName} /> : null}
          {current ? (
            <Field
              label={t('validUntil')}
              value={formatDate(current.endDate, locale, settings.timezone)}
            />
          ) : null}
          <Field
            label={tAthlete('birthDate')}
            value={formatDate(athlete.birthDate, locale, settings.timezone)}
          />
          {athlete.emergencyPhone ? (
            <Field label={tAthlete('emergencyPhone')} value={athlete.emergencyPhone} />
          ) : null}
          {canViewSensitive && athlete.bloodType ? (
            <Field label={tAthlete('bloodType')} value={athlete.bloodType} />
          ) : null}
        </dl>

        <div className="mt-3 flex items-end justify-between border-t border-slate-200 pt-2 text-[10px] text-muted-foreground">
          <span>
            {t('printedAt')}: {formatDate(new Date(), locale, settings.timezone)}
          </span>
          <span className="w-24 border-t border-slate-300 pt-1 text-center">{t('signature')}</span>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
