import type { AthleteDocument, DocumentType, Prisma } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { pagination, toOrderBy } from '@/shared/api/query';
import { addDays, parseDateOnly, todayIn } from '@/shared/dates';
import { appTimeZone } from '@/shared/config/settings';
import type { DocumentListQuery, DocumentTypeListQuery } from './schema';

type Db = typeof prisma | PrismaTransaction;

const TYPE_SORTABLE = ['name', 'sortOrder', 'createdAt', 'isActive'];
const DOC_SORTABLE = ['createdAt', 'expiryDate', 'sizeBytes'];

export type DocumentWithRelations = AthleteDocument & {
  documentType: DocumentType;
  athlete: { id: string; firstName: string; lastName: string; registrationNo: string };
};

const DOCUMENT_INCLUDE = {
  documentType: true,
  athlete: { select: { id: true, firstName: true, lastName: true, registrationNo: true } },
} satisfies Prisma.AthleteDocumentInclude;

function buildTypeWhere(query: DocumentTypeListQuery): Prisma.DocumentTypeWhereInput {
  const where: Prisma.DocumentTypeWhereInput = {};
  if (query.isActive === 'true') where.isActive = true;
  if (query.isActive === 'false') where.isActive = false;
  if (query.q) where.name = { contains: query.q, mode: 'insensitive' };
  return where;
}

function buildDocumentWhere(
  query: DocumentListQuery,
  scope: Prisma.AthleteWhereInput,
): Prisma.AthleteDocumentWhereInput {
  const where: Prisma.AthleteDocumentWhereInput = { deletedAt: null };
  if (query.athleteId) where.athleteId = query.athleteId;
  if (query.documentTypeId) where.documentTypeId = query.documentTypeId;
  if (query.status) where.status = query.status;
  if (query.expiringInDays) {
    const today = parseDateOnly(todayIn(appTimeZone()));
    where.expiryDate = { gte: today, lte: addDays(today, query.expiringInDays) };
    where.status = 'ACTIVE';
  }
  if (Object.keys(scope).length > 0) where.athlete = scope;
  return where;
}

export const documentRepository = {
  // ---------- أنواع الوثائق ----------
  async listTypes(query: DocumentTypeListQuery): Promise<{ items: DocumentType[]; total: number }> {
    const where = buildTypeWhere(query);
    const orderBy = toOrderBy(query.sort, TYPE_SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.documentType.findMany({
        where,
        orderBy: orderBy.length > 0 ? orderBy : [{ sortOrder: 'asc' }, { name: 'asc' }],
        ...pagination(query),
      }),
      prisma.documentType.count({ where }),
    ]);
    return { items, total };
  },

  async findTypeById(id: string, tx?: PrismaTransaction): Promise<DocumentType | null> {
    const client: Db = tx ?? prisma;
    return client.documentType.findUnique({ where: { id } });
  },

  async findTypeByName(name: string, excludeId?: string, tx?: PrismaTransaction): Promise<DocumentType | null> {
    const client: Db = tx ?? prisma;
    return client.documentType.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  },

  async countTypeDocuments(documentTypeId: string, tx?: PrismaTransaction): Promise<number> {
    const client: Db = tx ?? prisma;
    return client.athleteDocument.count({ where: { documentTypeId, deletedAt: null } });
  },

  // ---------- الوثائق ----------
  async list(query: DocumentListQuery, scope: Prisma.AthleteWhereInput): Promise<{
    items: DocumentWithRelations[];
    total: number;
  }> {
    const where = buildDocumentWhere(query, scope);
    const orderBy = toOrderBy(query.sort, DOC_SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.athleteDocument.findMany({
        where,
        include: DOCUMENT_INCLUDE,
        orderBy: orderBy.length > 0 ? orderBy : [{ createdAt: 'desc' }],
        ...pagination(query),
      }),
      prisma.athleteDocument.count({ where }),
    ]);
    return { items, total };
  },

  async findById(id: string, tx?: PrismaTransaction): Promise<DocumentWithRelations | null> {
    const client: Db = tx ?? prisma;
    return client.athleteDocument.findFirst({
      where: { id, deletedAt: null },
      include: DOCUMENT_INCLUDE,
    });
  },
};
