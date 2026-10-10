'use client';

import { useTranslations } from 'next-intl';
import type { CoachDto } from '@/shared/api/types';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { EntityCrud, type CrudField, type CrudFormValues } from '@/features/common/entity-crud';
import type { DataTableColumn } from '@/shared/ui-kit/data-table';
import { StatusBadge } from '@/shared/ui-kit/status-badge';

export function CoachesScreen() {
  const t = useTranslations('coach');
  const tc = useTranslations('common');
  const { can } = useSession();
  const fmt = useFormatters();

  const columns: DataTableColumn<CoachDto>[] = [
    {
      key: 'firstName',
      header: tc('fullName'),
      cell: (c) => (
        <span className="font-medium">
          {c.firstName} {c.lastName}
        </span>
      ),
    },
    { header: tc('phone'), cell: (c) => (c.phone ? <span className="ltr-field">{c.phone}</span> : '—'), showInCard: false },
    { header: t('specialization'), cell: (c) => c.specialization ?? '—' },
    { header: t('certificate'), cell: (c) => c.certificate ?? '—', showInCard: false },
    {
      header: t('sports'),
      cell: (c) => (c.coachSports ?? []).map((s) => s.sport?.name).filter(Boolean).join('، ') || '—',
      showInCard: false,
    },
    { key: 'joinedAt', header: t('joinedAt'), cell: (c) => fmt.date(c.joinedAt), showInCard: false },
    {
      header: tc('status'),
      cell: (c) => <StatusBadge value={c.isActive ? 'ACTIVE' : 'DISABLED'} />,
    },
  ];

  const fields: CrudField[] = [
    { name: 'firstName', label: tc('firstName'), type: 'text', required: true, minLength: 2 },
    { name: 'lastName', label: tc('lastName'), type: 'text', required: true, minLength: 2 },
    { name: 'phone', label: tc('phone'), type: 'tel' },
    { name: 'email', label: tc('email'), type: 'email' },
    { name: 'specialization', label: t('specialization'), type: 'text' },
    { name: 'certificate', label: t('certificate'), type: 'text' },
    { name: 'joinedAt', label: t('joinedAt'), type: 'date' },
    { name: 'photoUrl', label: t('photoUrl'), type: 'text', full: true, ltr: true },
    { name: 'isActive', label: tc('active'), type: 'checkbox', defaultValue: true },
    {
      name: 'confirmDeactivation',
      label: t('confirmDeactivation'),
      type: 'checkbox',
      editOnly: true,
      hint: t('deactivationWarning'),
      full: true,
    },
    { name: 'notes', label: tc('notes'), type: 'textarea', full: true },
  ];

  const toForm = (c: CoachDto): CrudFormValues => ({
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone ?? '',
    email: c.email ?? '',
    specialization: c.specialization ?? '',
    certificate: c.certificate ?? '',
    joinedAt: c.joinedAt ? c.joinedAt.slice(0, 10) : '',
    photoUrl: c.photoUrl ?? '',
    isActive: c.isActive,
    confirmDeactivation: false,
    notes: c.notes ?? '',
  });

  const toBody = (v: CrudFormValues) => ({
    firstName: v.firstName,
    lastName: v.lastName,
    phone: v.phone || undefined,
    email: v.email || undefined,
    specialization: v.specialization || null,
    certificate: v.certificate || null,
    joinedAt: v.joinedAt || null,
    photoUrl: v.photoUrl || null,
    isActive: v.isActive === true,
    confirmDeactivation: v.confirmDeactivation === true ? true : undefined,
    notes: v.notes || null,
  });

  return (
    <EntityCrud<CoachDto>
      title={t('titlePlural')}
      apiPath="/coaches"
      rowId={(c) => c.id}
      columns={columns}
      fields={fields}
      toForm={toForm}
      toBody={toBody}
      getVersion={(c) => c.version}
      canCreate={can('coaches.create')}
      canEdit={can('coaches.edit')}
      canDelete={can('coaches.delete')}
      filters={[
        {
          name: 'isActive',
          label: tc('status'),
          options: [
            { value: 'true', label: tc('active') },
            { value: 'false', label: tc('disabled') },
          ],
        },
      ]}
      createLabel={t('newCoach')}
      editLabel={t('editCoach')}
      deleteMessage={() => t('deleteConfirm')}
      defaultSort="lastName"
    />
  );
}
