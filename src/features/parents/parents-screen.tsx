'use client';

import { useTranslations } from 'next-intl';
import type { ParentDto } from '@/shared/api/types';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { EntityCrud, type CrudField, type CrudFormValues } from '@/features/common/entity-crud';
import type { DataTableColumn } from '@/shared/ui-kit/data-table';

export function ParentsScreen() {
  const t = useTranslations('parent');
  const tc = useTranslations('common');
  const { can } = useSession();
  const fmt = useFormatters();

  const columns: DataTableColumn<ParentDto>[] = [
    {
      key: 'firstName',
      header: tc('fullName'),
      cell: (p) => (
        <span className="font-medium">
          {p.firstName} {p.lastName}
        </span>
      ),
    },
    { key: 'phone', header: tc('phone'), cell: (p) => <span className="ltr-field">{p.phone}</span> },
    { header: tc('phone2'), cell: (p) => (p.phone2 ? <span className="ltr-field">{p.phone2}</span> : '—'), showInCard: false },
    { header: tc('email'), cell: (p) => (p.email ? <span className="ltr-field">{p.email}</span> : '—'), showInCard: false },
    { header: t('relationship'), cell: (p) => p.relationship ?? '—', showInCard: false },
    {
      header: t('children'),
      cell: (p) =>
        p.athleteParents && p.athleteParents.length > 0
          ? p.athleteParents.map((l) => `${l.athlete.firstName} ${l.athlete.lastName}`).join('، ')
          : t('noAthletes'),
    },
    { key: 'createdAt', header: tc('createdAt'), cell: (p) => fmt.date(p.createdAt), showInCard: false },
  ];

  const fields: CrudField[] = [
    { name: 'firstName', label: tc('firstName'), type: 'text', required: true, minLength: 2, maxLength: 60 },
    { name: 'lastName', label: tc('lastName'), type: 'text', required: true, minLength: 2, maxLength: 60 },
    { name: 'phone', label: tc('phone'), type: 'tel', required: true },
    { name: 'phone2', label: tc('phone2'), type: 'tel' },
    { name: 'email', label: tc('email'), type: 'email' },
    { name: 'relationship', label: t('relationship'), type: 'text', maxLength: 50 },
    { name: 'address', label: tc('address'), type: 'text', full: true },
    { name: 'notes', label: tc('notes'), type: 'textarea', full: true },
    {
      name: 'overrideDuplicate',
      label: t('overrideDuplicate'),
      type: 'checkbox',
      createOnly: true,
      hint: t('duplicatePhoneWarning'),
      full: true,
    },
  ];

  const toForm = (p: ParentDto): CrudFormValues => ({
    firstName: p.firstName,
    lastName: p.lastName,
    phone: p.phone,
    phone2: p.phone2 ?? '',
    email: p.email ?? '',
    relationship: p.relationship ?? '',
    address: p.address ?? '',
    notes: p.notes ?? '',
    overrideDuplicate: false,
  });

  const toBody = (v: CrudFormValues) => ({
    firstName: v.firstName,
    lastName: v.lastName,
    phone: v.phone,
    phone2: v.phone2 || undefined,
    email: v.email || undefined,
    relationship: v.relationship || undefined,
    address: v.address || undefined,
    notes: v.notes || undefined,
    overrideDuplicate: v.overrideDuplicate === true ? true : undefined,
  });

  return (
    <EntityCrud<ParentDto>
      title={t('titlePlural')}
      apiPath="/parents"
      rowId={(p) => p.id}
      columns={columns}
      fields={fields}
      toForm={toForm}
      toBody={toBody}
      getVersion={(p) => p.version}
      canCreate={can('parents.create')}
      canEdit={can('parents.edit')}
      canDelete={can('parents.delete')}
      createLabel={t('newParent')}
      editLabel={t('editParent')}
      deleteMessage={() => t('deleteConfirm')}
      defaultSort="-createdAt"
    />
  );
}
