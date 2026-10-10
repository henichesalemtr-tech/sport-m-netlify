'use client';

/**
 * DocumentTypesScreen — CRUD أنواع الوثائق عبر EntityCrud (القائمة مرقّمة paginated).
 * عقود (src/app/api/v1/document-types/*):
 *  - GET /document-types (paginated) — filters isActive?('true'|'false'), q?(name)
 *  - POST /document-types — {name(2..80), isActive?, sortOrder?} — server: settings.manage
 *  - PATCH /document-types/[id] — partial — server: settings.manage
 *  - DELETE /document-types/[id] — بلا version/جسم — server: settings.manage
 */
import { useTranslations } from 'next-intl';
import type { DocumentTypeDto } from '@/shared/api/types';
import { useSession } from '@/shared/components/session-context';
import { useFormatters } from '@/features/common/use-formatters';
import { tr } from '@/features/common/tr';
import { EntityCrud, type CrudField } from '@/features/common/entity-crud';
import type { DataTableColumn } from '@/shared/ui-kit/data-table';
import { StatusBadge } from '@/shared/ui-kit/status-badge';
import type { CrudFormValues } from '@/features/common/entity-crud';

export function DocumentTypesScreen() {
  const t = useTranslations('document');
  const tc = useTranslations('common');
  const fmt = useFormatters();
  const { can } = useSession();

  const canManage = can('settings.manage');

  const fields: CrudField[] = [
    { name: 'name', label: tr(t, 'documentType', 'نوع الوثيقة'), type: 'text', required: true, minLength: 2, maxLength: 80 },
    { name: 'sortOrder', label: tr(t, 'sortOrder', 'ترتيب العرض'), type: 'number', min: 0 },
    { name: 'isActive', label: tr(t, 'active', 'نشط'), type: 'checkbox', defaultValue: true },
  ];

  const columns: DataTableColumn<DocumentTypeDto>[] = [
    { key: 'name', header: tc('name'), cell: (r) => <span className="font-medium">{r.name}</span>, showInCard: true },
    {
      key: 'sortOrder',
      header: tr(t, 'sortOrder', 'ترتيب العرض'),
      cell: (r) => <span className="tabular-nums">{fmt.number(r.sortOrder)}</span>,
      align: 'end',
      showInCard: true,
    },
    {
      key: 'isActive',
      header: tc('status'),
      cell: (r) => <StatusBadge value={r.isActive ? 'ACTIVE' : 'INACTIVE'} />,
      showInCard: true,
    },
  ];

  const toForm = (row: DocumentTypeDto): CrudFormValues => ({
    name: row.name,
    sortOrder: String(row.sortOrder),
    isActive: row.isActive,
  });

  const toBody = (values: CrudFormValues): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      name: String(values.name ?? '').trim(),
      isActive: Boolean(values.isActive),
    };
    const raw = String(values.sortOrder ?? '').trim();
    if (raw !== '') {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 0) body.sortOrder = n;
    }
    return body;
  };

  return (
    <EntityCrud<DocumentTypeDto>
      title={tr(t, 'typesTab', 'أنواع الوثائق')}
      apiPath="/document-types"
      rowId={(r) => r.id}
      columns={columns}
      fields={fields}
      toForm={toForm}
      toBody={toBody}
      defaultSort="sortOrder"
      canCreate={canManage}
      canEdit={canManage}
      canDelete={canManage}
      createLabel={tr(t, 'newType', 'نوع جديد')}
      searchPlaceholder={tr(t, 'documentType', 'نوع الوثيقة') + '…'}
      deleteMessage={(r) => `${r.name} — ${tc('deleteConfirm')}`}
    />
  );
}
