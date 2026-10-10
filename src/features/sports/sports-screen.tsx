'use client';

/** الأنشطة — قائمة مع إنشاء/تعديل/تعطيل فوري (EntityCrud). */
import { useTranslations } from 'next-intl';
import type { SportDto } from '@/shared/api/types';
import { useSession } from '@/shared/components/session-context';
import { EntityCrud, type CrudField, type CrudFormValues } from '@/features/common/entity-crud';
import type { DataTableColumn } from '@/shared/ui-kit/data-table';
import { StatusBadge, Badge } from '@/shared/ui-kit/status-badge';

export function SportsScreen() {
  const t = useTranslations('sport');
  const tc = useTranslations('common');
  const { can } = useSession();

  const columns: DataTableColumn<SportDto>[] = [
    {
      key: 'name',
      header: tc('name'),
      cell: (s) => (
        <span className="flex items-center gap-2">
          {s.color ? <span className="size-3 rounded-full border border-border" style={{ backgroundColor: s.color }} aria-hidden /> : null}
          <span className="font-medium">{s.name}</span>
        </span>
      ),
      showInCard: true,
    },
    { header: t('nameEn'), cell: (s) => (s.nameEn ? <span className="ltr-field">{s.nameEn}</span> : '—'), showInCard: false },
    {
      key: 'sortOrder',
      header: t('sortOrder'),
      cell: (s) => <span className="tabular-nums">{s.sortOrder}</span>,
      showInCard: false,
    },
    { header: t('color'), cell: (s) => (s.color ? <span className="ltr-field font-mono text-xs">{s.color}</span> : '—'), showInCard: false },
    {
      header: tc('status'),
      cell: (s) =>
        s.isActive ? <StatusBadge value="ACTIVE" /> : <Badge label={tc('disabled')} tone="muted" />,
      showInCard: true,
    },
  ];

  const fields: CrudField[] = [
    { name: 'name', label: tc('name'), type: 'text', required: true, minLength: 2, maxLength: 100 },
    { name: 'nameEn', label: t('nameEn'), type: 'text', maxLength: 100, ltr: true },
    { name: 'color', label: t('color'), type: 'text', ltr: true, hint: '#RRGGBB' },
    { name: 'sortOrder', label: t('sortOrder'), type: 'number', defaultValue: '0' },
    { name: 'isActive', label: tc('active'), type: 'checkbox', defaultValue: true },
  ];

  const toForm = (s: SportDto): CrudFormValues => ({
    name: s.name,
    nameEn: s.nameEn ?? '',
    color: s.color ?? '',
    sortOrder: String(s.sortOrder),
    isActive: s.isActive,
  });

  const toBody = (v: CrudFormValues) => ({
    name: v.name,
    nameEn: typeof v.nameEn === 'string' && v.nameEn ? v.nameEn : undefined,
    color: typeof v.color === 'string' && v.color ? v.color : undefined,
    sortOrder: v.sortOrder === '' ? undefined : Number(v.sortOrder),
    isActive: v.isActive === true,
  });

  return (
    <EntityCrud<SportDto>
      title={t('titlePlural')}
      apiPath="/sports"
      rowId={(s) => s.id}
      columns={columns}
      fields={fields}
      toForm={toForm}
      toBody={toBody}
      getVersion={(s) => s.version}
      canCreate={can('sports.manage')}
      canEdit={can('sports.manage')}
      canDelete={can('sports.manage')}
      createLabel={t('newSport')}
      editLabel={t('editSport')}
      deleteMessage={() => t('deleteConfirm')}
      defaultSort="sortOrder"
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
    />
  );
}
