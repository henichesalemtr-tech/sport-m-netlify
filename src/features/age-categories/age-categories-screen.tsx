'use client';

/** الفئات العمرية — قائمة مع إنشاء/تعديل؛ أخطاء التداخل/الفجوات تظهر من الخادم على الحقول. */
import { useTranslations } from 'next-intl';
import type { AgeCategoryDto } from '@/shared/api/types';
import { useSession } from '@/shared/components/session-context';
import { EntityCrud, type CrudField, type CrudFormValues } from '@/features/common/entity-crud';
import { MONTHS } from '@/shared/lib/options';
import type { DataTableColumn } from '@/shared/ui-kit/data-table';
import { StatusBadge, Badge } from '@/shared/ui-kit/status-badge';

export function AgeCategoriesScreen() {
  const t = useTranslations('ageCategory');
  const tc = useTranslations('common');
  const { can } = useSession();

  const columns: DataTableColumn<AgeCategoryDto>[] = [
    {
      key: 'name',
      header: tc('name'),
      cell: (c) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{c.name}</span>
          <Badge label={t(c.kind)} tone={c.kind === 'SENIOR' ? 'accent' : 'muted'} />
        </span>
      ),
      showInCard: true,
    },
    {
      header: t('minAge'),
      cell: (c) => (c.minAge !== null ? <span className="tabular-nums">{c.minAge}</span> : '—'),
      showInCard: true,
    },
    {
      header: t('maxAge'),
      cell: (c) => (c.kind === 'SENIOR' ? '—' : c.maxAge !== null ? <span className="tabular-nums">{c.maxAge}</span> : '—'),
      showInCard: true,
    },
    {
      header: t('seasonStartMonth'),
      cell: (c) => <span className="tabular-nums">{c.seasonStartMonth}</span>,
      showInCard: false,
    },
    { key: 'sortOrder', header: tc('sort'), cell: (c) => <span className="tabular-nums">{c.sortOrder}</span>, showInCard: false },
    {
      header: tc('status'),
      cell: (c) => (c.isActive ? <StatusBadge value="ACTIVE" /> : <Badge label={tc('disabled')} tone="muted" />),
      showInCard: false,
    },
  ];

  const fields: CrudField[] = [
    { name: 'name', label: tc('name'), type: 'text', required: true, minLength: 2, maxLength: 100 },
    {
      name: 'kind',
      label: t('kind'),
      type: 'select',
      required: true,
      defaultValue: 'NORMAL',
      options: [
        { value: 'NORMAL', label: t('NORMAL') },
        { value: 'SENIOR', label: t('SENIOR') },
      ],
      hint: t('seniorHint'),
    },
    { name: 'minAge', label: t('minAge'), type: 'number', required: true },
    { name: 'maxAge', label: t('maxAge'), type: 'number', hint: t('seniorHint') },
    {
      name: 'seasonStartMonth',
      label: t('seasonStartMonth'),
      type: 'select',
      required: true,
      defaultValue: '9',
      options: MONTHS.map((m) => ({ value: String(m), label: String(m) })),
    },
    { name: 'sortOrder', label: tc('sort'), type: 'number', defaultValue: '0' },
    { name: 'isActive', label: tc('active'), type: 'checkbox', defaultValue: true },
  ];

  const toForm = (c: AgeCategoryDto): CrudFormValues => ({
    name: c.name,
    kind: c.kind,
    minAge: c.minAge !== null ? String(c.minAge) : '',
    maxAge: c.maxAge !== null ? String(c.maxAge) : '',
    seasonStartMonth: String(c.seasonStartMonth),
    sortOrder: String(c.sortOrder),
    isActive: c.isActive,
  });

  const toBody = (values: CrudFormValues) => ({
    name: values.name,
    kind: values.kind,
    minAge: values.minAge === '' ? null : Number(values.minAge),
    // فئة الأكابر بلا حد أقصى
    maxAge: values.kind === 'SENIOR' || values.maxAge === '' ? null : Number(values.maxAge),
    seasonStartMonth: Number(values.seasonStartMonth),
    sortOrder: values.sortOrder === '' ? undefined : Number(values.sortOrder),
    isActive: values.isActive === true,
  });

  return (
    <EntityCrud<AgeCategoryDto>
      title={t('titlePlural')}
      apiPath="/age-categories"
      rowId={(c) => c.id}
      columns={columns}
      fields={fields}
      toForm={toForm}
      toBody={toBody}
      getVersion={(c) => c.version}
      canCreate={can('age_categories.manage')}
      canEdit={can('age_categories.manage')}
      canDelete={can('age_categories.manage')}
      createLabel={t('newCategory')}
      editLabel={t('editCategory')}
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
