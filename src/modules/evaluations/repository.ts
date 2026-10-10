import type { Evaluation, EvaluationTemplate, Prisma } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { pagination, toOrderBy } from '@/shared/api/query';
import { parseDateOnly } from '@/shared/dates';
import type { EvaluationListQuery, EvaluationTemplateListQuery } from './schema';

type Db = typeof prisma | PrismaTransaction;

const TEMPLATE_SORTABLE = ['name', 'createdAt', 'isActive'];
const EVALUATION_SORTABLE = ['evaluationDate', 'createdAt'];

export interface EvaluationTemplateListResult {
  items: EvaluationTemplate[];
  total: number;
}

export interface EvaluationListResult {
  items: EvaluationWithRelations[];
  total: number;
}

export type EvaluationWithRelations = Evaluation & {
  template: EvaluationTemplate;
  athlete: { id: string; firstName: string; lastName: string; registrationNo: string };
  coach: { id: string; firstName: string; lastName: string };
};

const EVALUATION_INCLUDE = {
  template: true,
  athlete: { select: { id: true, firstName: true, lastName: true, registrationNo: true } },
  coach: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.EvaluationInclude;

function buildTemplateWhere(query: EvaluationTemplateListQuery): Prisma.EvaluationTemplateWhereInput {
  const where: Prisma.EvaluationTemplateWhereInput = { deletedAt: null };
  if (query.sportId) where.sportId = query.sportId;
  if (query.isActive === 'true') where.isActive = true;
  if (query.isActive === 'false') where.isActive = false;
  if (query.q) where.name = { contains: query.q, mode: 'insensitive' };
  return where;
}

function buildEvaluationWhere(
  query: EvaluationListQuery,
  scope: Prisma.AthleteWhereInput,
): Prisma.EvaluationWhereInput {
  const where: Prisma.EvaluationWhereInput = { deletedAt: null };
  if (query.athleteId) where.athleteId = query.athleteId;
  if (query.coachId) where.coachId = query.coachId;
  if (query.templateId) where.templateId = query.templateId;
  if (query.dateFrom || query.dateTo) {
    where.evaluationDate = {};
    if (query.dateFrom) where.evaluationDate.gte = parseDateOnly(query.dateFrom);
    if (query.dateTo) where.evaluationDate.lte = parseDateOnly(query.dateTo);
  }
  // نطاق البيانات (5.4): المدرب المقيّد يرى تقييمات رياضيه فقط
  if (Object.keys(scope).length > 0) where.athlete = scope;
  return where;
}

export const evaluationRepository = {
  // ---------- القوالب ----------
  async listTemplates(query: EvaluationTemplateListQuery): Promise<EvaluationTemplateListResult> {
    const where = buildTemplateWhere(query);
    const orderBy = toOrderBy(query.sort, TEMPLATE_SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.evaluationTemplate.findMany({
        where,
        orderBy: orderBy.length > 0 ? orderBy : [{ createdAt: 'desc' }],
        ...pagination(query),
      }),
      prisma.evaluationTemplate.count({ where }),
    ]);
    return { items, total };
  },

  async findTemplateById(id: string, tx?: PrismaTransaction): Promise<EvaluationTemplate | null> {
    const client: Db = tx ?? prisma;
    return client.evaluationTemplate.findFirst({ where: { id, deletedAt: null } });
  },

  async findTemplateByName(
    name: string,
    sportId: string | null,
    excludeId?: string,
    tx?: PrismaTransaction,
  ): Promise<EvaluationTemplate | null> {
    const client: Db = tx ?? prisma;
    return client.evaluationTemplate.findFirst({
      where: {
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
        sportId: sportId ?? null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
    }) as Promise<EvaluationTemplate | null>;
  },

  async countTemplateEvaluations(templateId: string, tx?: PrismaTransaction): Promise<number> {
    const client: Db = tx ?? prisma;
    return client.evaluation.count({ where: { templateId, deletedAt: null } });
  },

  // ---------- التقييمات ----------
  async list(query: EvaluationListQuery, scope: Prisma.AthleteWhereInput): Promise<EvaluationListResult> {
    const where = buildEvaluationWhere(query, scope);
    const orderBy = toOrderBy(query.sort, EVALUATION_SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.evaluation.findMany({
        where,
        include: EVALUATION_INCLUDE,
        orderBy: orderBy.length > 0 ? orderBy : [{ evaluationDate: 'desc' }, { createdAt: 'desc' }],
        ...pagination(query),
      }),
      prisma.evaluation.count({ where }),
    ]);
    return { items, total };
  },

  async findById(id: string, tx?: PrismaTransaction): Promise<EvaluationWithRelations | null> {
    const client: Db = tx ?? prisma;
    return client.evaluation.findFirst({
      where: { id, deletedAt: null },
      include: EVALUATION_INCLUDE,
    });
  },

  /** السلسلة الزمنية لتقدم رياضي (رسم بياني) — مرتبة تصاعديًا حسب التاريخ. */
  async timeSeries(athleteId: string, templateId?: string): Promise<EvaluationWithRelations[]> {
    return prisma.evaluation.findMany({
      where: { deletedAt: null, athleteId, ...(templateId ? { templateId } : {}) },
      include: EVALUATION_INCLUDE,
      orderBy: [{ evaluationDate: 'asc' }, { createdAt: 'asc' }],
    });
  },

  /** رياضيو مجموعة (أعضاء نشطون). */
  async listGroupAthletes(groupId: string): Promise<
    Array<{ athleteId: string; firstName: string; lastName: string; registrationNo: string }>
  > {
    return prisma.groupMember
      .findMany({
        where: { groupId, leftAt: null },
        select: {
          athleteId: true,
          athlete: { select: { firstName: true, lastName: true, registrationNo: true } },
        },
      })
      .then((rows) =>
        rows.map((r) => ({
          athleteId: r.athleteId,
          firstName: r.athlete.firstName,
          lastName: r.athlete.lastName,
          registrationNo: r.athlete.registrationNo,
        })),
      );
  },

  /** آخر تقييم لكل رياضي ضمن قائمة (للمقارنة الجماعية). */
  async latestForAthletes(athleteIds: string[]): Promise<EvaluationWithRelations[]> {
    if (athleteIds.length === 0) return [];
    return prisma.evaluation.findMany({
      where: { deletedAt: null, athleteId: { in: athleteIds } },
      include: EVALUATION_INCLUDE,
      orderBy: [{ evaluationDate: 'desc' }, { createdAt: 'desc' }],
    });
  },

  async findGroupById(groupId: string, tx?: PrismaTransaction) {
    const client: Db = tx ?? prisma;
    return client.group.findFirst({
      where: { id: groupId, deletedAt: null },
      select: { id: true, name: true, code: true, coachId: true, sportId: true },
    });
  },

  async findCoachById(coachId: string, tx?: PrismaTransaction) {
    const client: Db = tx ?? prisma;
    return client.coach.findFirst({
      where: { id: coachId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
  },

  async findAthleteById(athleteId: string, tx?: PrismaTransaction) {
    const client: Db = tx ?? prisma;
    return client.athlete.findFirst({
      where: { id: athleteId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
  },
};
