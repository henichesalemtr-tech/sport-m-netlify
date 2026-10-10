'use client';

/** القاعات والملاعب — قائمة مع إنشاء/تعديل (EntityCrud). */
import { useTranslations } from 'next-intl';
import type { VenueDto } from '@/shared/api/types';
import { useSession } from '@/shared/components/session-context';
import { EntityCrud, type CrudField, type CrudFormValues } from '@/features/common/entity-crud';
import { VENUE_STATUSES, VENUE_TYPES } from '@/shared/lib/options';
import type { DataTableColumn } from '@/shared/ui-kit/data-table';
import { StatusBadge } from '@/shared/ui-kit/status-badge';

export function VenuesScreen() {
  const t = useTranslations('venue');
  const tc = useTranslations('common');
  const ts = useTranslations('status');
  const { can } = useSession();

  const columns: DataTableColumn<VenueDto>[] = [
    { key: 'name', header: tc('name'), cell: (v) => <span className="font-medium">{v.name}</span>, showInCard: true },
    { header: t('type'), cell: (v) => t(`types.${v.type}`), showInCard: false },
    {
      header: t('capacity'),
      cell: (v) => (v.capacity !== null ? <span className="tabular-nums">{v.capacity}</span> : '—'),
      showInCard: false,
    },
    { header: t('location'), cell: (v) => v.location ?? '—' },
    { key: 'status', header: tc('status'), cell: (v) => <StatusBadge value={v.status} />, showInCard: true },
  ];

  const fields: CrudField[] = [
    { name: 'name', label: tc('name'), type: 'text', required: true, minLength: 2, maxLength: 120 },
    {
      name: 'type',
      label: t('type'),
      type: 'select',
      required: true,
      defaultValue: 'HALL',
      options: VENUE_TYPES.map((x) => ({ value: x, label: t(`types.${x}`) })),
    },
    { name: 'capacity', label: t('capacity'), type: 'number', min: 1 },
    {
      name: 'status',
      label: tc('status'),
      type: 'select',
      required: true,
      defaultValue: 'AVAILABLE',
      options: VENUE_STATUSES.map((x) => ({ value: x, label: ts(x) })),
    },
    { name: 'location', label: t('location'), type: 'text', maxLength: 255 },
    { name: 'notes', label: tc('notes'), type: 'textarea', full: true },
  ];

  const toForm = (v: VenueDto): CrudFormValues => ({
    name: v.name,
    type: v.type,
    capacity: v.capacity !== null ? String(v.capacity) : '',
    status: v.status,
    location: v.location ?? '',
    notes: v.notes ?? '',
  });

  const toBody = (values: CrudFormValues) => ({
    name: values.name,
    type: values.type,
    capacity: values.capacity === '' ? null : Number(values.capacity),
    status: values.status,
    location: typeof values.location === 'string' && values.location ? values.location : undefined,
    notes: values.notes || null,
  });

  return (
    <EntityCrud<VenueDto>
      title={t('titlePlural')}
      apiPath="/venues"
      rowId={(v) => v.id}
      columns={columns}
      fields={fields}
      toForm={toForm}
      toBody={toBody}
      getVersion={(v) => v.version}
      canCreate={can('venues.manage')}
      canEdit={can('venues.manage')}
      canDelete={can('venues.manage')}
      createLabel={t('newVenue')}
      editLabel={t('editVenue')}
      deleteMessage={() => t('deleteConfirm')}
      defaultSort="name"
      filters={[
        {
          name: 'type',
          label: t('type'),
          options: VENUE_TYPES.map((x) => ({ value: x, label: t(`types.${x}`) })),
        },
        {
          name: 'status',
          label: tc('status'),
          options: VENUE_STATUSES.map((x) => ({ value: x, label: ts(x) })),
        },
      ]}
    />
  );
}
