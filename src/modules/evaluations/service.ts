/**
 * خدمة التقييمات (7.15):
 * - قوالب تقييم لكل نشاط بمعايير JSON ومقياس رقمي (مثل 1-5).
 * - تقييم رياضي بتاريخ ومدرب ودرجات JSON وملاحظات.
 * - نطاق البيانات: المدرب لا يقيّم/يرى إلا رياضيه (5.4).
 * - سلسلة زمنية للتقدم + تقرير مقارنة جماعية.
 */
import type { Evaluation, EvaluationTemplate } from '@prisma/client';
import { prisma } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { businessRule, conflict, forbidden, notFound, validationError } from '@/shared/errors';
import { parseDateOnly } from '@/shared/dates';
import {
  athleteScopeWhere,
  assertAthleteInScope,
  isScopeRestricted,
  toScoped,
  type Scoped,
} from '@/shared/permissions/scope';
import type { AuthContext } from '@/shared/permissions/guard';
import type { Meta } from '@/shared/api/meta';
import { evaluationRepository, type EvaluationWithRelations } from './repository';
import type {
  CreateEvaluationInput,
  CreateEvaluationTemplateInput,
  Criterion,
  EvaluationListQuery,
  EvaluationTemplateListQuery,
  UpdateEvaluationInput,
  UpdateEvaluationTemplateInput,
} from './schema';

const TEMPLATE_ENTITY = 'EvaluationTemplate';
const ENTITY = 'Evaluation';

/** تحليل JSON بأمان دون any. */
function parseJsonRecord(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

export function parseCriteria(json: string): Criterion[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    const out: Criterion[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      if (typeof rec.key === 'string' && typeof rec.label === 'string' &&
          typeof rec.min === 'number' && typeof rec.max === 'number') {
        out.push({ key: rec.key, label: rec.label, min: rec.min, max: rec.max });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function parseScores(json: string): Record<string, number> {
  const rec = parseJsonRecord(json);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** التحقق أن الدرجات تغطي كل معايير القالب وضمن الحدود. دالة نقية. */
export function validateScoresAgainstCriteria(
  scores: Record<string, number>,
  criteria: Criterion[],
): void {
  const fieldErrors: Record<string, string[]> = {};
  const byKey = new Map(criteria.map((c) => [c.key, c] as const));
  for (const c of criteria) {
    if (!(c.key in scores)) {
      fieldErrors[`scores.${c.key}`] = [`المعيار "${c.label}" مطلوب`];
    }
  }
  for (const [key, value] of Object.entries(scores)) {
    const c = byKey.get(key);
    if (!c) {
      fieldErrors[`scores.${key}`] = ['معيار غير معروف في هذا القالب'];
      continue;
    }
    if (value < c.min || value > c.max) {
      fieldErrors[`scores.${key}`] = [`الدرجة يجب أن تكون بين ${c.min} و${c.max}`];
    }
  }
  if (Object.keys(fieldErrors).length > 0) throw validationError(fieldErrors);
}

/** مجموع/متوسط الدرجات (للتقدم والمقارنة). دالة نقية. */
export function scoreStats(scores: Record<string, number>): { total: number; average: number; count: number } {
  const values = Object.values(scores);
  const total = values.reduce((a, b) => a + b, 0);
  return { total, average: values.length > 0 ? total / values.length : 0, count: values.length };
}

function serializeCriteria(criteria: Criterion[]): string {
  return JSON.stringify(criteria);
}

/** حلّ معرّف المدرب حسب النطاق: المدرب المقيّد يستخدم linkedCoachId حصراً. */
function resolveCoachId(user: AuthContext, inputCoachId?: string): string {
  const scoped = toScoped(user);
  if (isScopeRestricted(scoped)) {
    if (inputCoachId && inputCoachId !== scoped.linkedCoachId) {
      throw forbidden('لا يمكن للمدرب إنشاء تقييم باسم مدرب آخر');
    }
    return scoped.linkedCoachId as string;
  }
  if (!inputCoachId) {
    throw validationError({ coachId: ['المدرب مطلوب'] });
  }
  return inputCoachId;
}

async function assertEvaluationScope(scoped: Scoped, evaluation: EvaluationWithRelations): Promise<void> {
  await assertAthleteInScope(scoped, evaluation.athleteId);
}

export const evaluationService = {
  // ---------- القوالب ----------
  async listTemplates(query: EvaluationTemplateListQuery): Promise<{ items: EvaluationTemplate[]; total: number }> {
    return evaluationRepository.listTemplates(query);
  },

  async getTemplateById(id: string): Promise<EvaluationTemplate> {
    const template = await evaluationRepository.findTemplateById(id);
    if (!template) throw notFound('قالب التقييم');
    return template;
  },

  async createTemplate(input: CreateEvaluationTemplateInput, meta: Meta): Promise<EvaluationTemplate> {
    return prisma.$transaction(async (tx) => {
      const sportId = input.sportId ?? null;
      const duplicate = await evaluationRepository.findTemplateByName(input.name, sportId, undefined, tx);
      if (duplicate) throw conflict('يوجد قالب تقييم بنفس الاسم للنشاط نفسه');
      if (sportId) {
        const sport = await tx.sport.findFirst({ where: { id: sportId, deletedAt: null }, select: { id: true } });
        if (!sport) throw notFound('النشاط الرياضي');
      }
      const keys = new Set(input.criteria.map((c) => c.key));
      if (keys.size !== input.criteria.length) {
        throw validationError({ criteria: ['مفاتيح المعايير يجب أن تكون فريدة'] });
      }

      const created = await tx.evaluationTemplate.create({
        data: {
          name: input.name,
          sportId,
          criteria: serializeCriteria(input.criteria),
          isActive: input.isActive ?? true,
          createdBy: meta.user.userId,
        },
      });
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'CREATE',
          entityType: TEMPLATE_ENTITY,
          entityId: created.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          after: { ...created, criteria: input.criteria },
        },
        tx,
      );
      return created;
    });
  },

  async updateTemplate(id: string, input: UpdateEvaluationTemplateInput, meta: Meta): Promise<EvaluationTemplate> {
    return prisma.$transaction(async (tx) => {
      const current = await evaluationRepository.findTemplateById(id, tx);
      if (!current) throw notFound('قالب التقييم');

      const sportId = input.sportId !== undefined ? input.sportId ?? null : current.sportId;
      const name = input.name ?? current.name;
      if (name !== current.name || sportId !== current.sportId) {
        const duplicate = await evaluationRepository.findTemplateByName(name, sportId, id, tx);
        if (duplicate) throw conflict('يوجد قالب تقييم بنفس الاسم للنشاط نفسه');
      }
      const criteria = input.criteria ?? parseCriteria(current.criteria);
      if (input.criteria) {
        const keys = new Set(input.criteria.map((c) => c.key));
        if (keys.size !== input.criteria.length) {
          throw validationError({ criteria: ['مفاتيح المعايير يجب أن تكون فريدة'] });
        }
        // منع حذف معايير مستخدمة في تقييمات سابقة (تشويه السلاسل الزمنية)
        const used = await evaluationRepository.countTemplateEvaluations(id, tx);
        if (used > 0) {
          const currentKeys = new Set(parseCriteria(current.criteria).map((c) => c.key));
          const removed = [...currentKeys].filter((k) => !keys.has(k));
          if (removed.length > 0) {
            throw businessRule('لا يمكن حذف معايير مستخدمة في تقييمات سابقة — عطّل القالب وأنشئ قالبًا جديدًا', {
              removed,
            });
          }
        }
      }

      const updated = await tx.evaluationTemplate.update({
        where: { id },
        data: {
          name,
          sportId,
          criteria: serializeCriteria(criteria),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: TEMPLATE_ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: { ...current, criteria: parseCriteria(current.criteria) },
          after: { ...updated, criteria },
        },
        tx,
      );
      return updated;
    });
  },

  /** حذف مرن — يُمنع إذا استُخدم القالب في تقييمات. */
  async removeTemplate(id: string, meta: Meta): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const current = await evaluationRepository.findTemplateById(id, tx);
      if (!current) throw notFound('قالب التقييم');
      const used = await evaluationRepository.countTemplateEvaluations(id, tx);
      if (used > 0) {
        throw businessRule(`لا يمكن حذف قالب مستخدم في ${used} تقييم — استخدم التعطيل`, { used });
      }
      await tx.evaluationTemplate.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'DELETE',
          entityType: TEMPLATE_ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: current,
        },
        tx,
      );
      return { id };
    });
  },

  // ---------- التقييمات ----------
  async list(user: AuthContext, query: EvaluationListQuery): Promise<{ items: EvaluationDto[]; total: number }> {
    const scoped = toScoped(user);
    const scope = await athleteScopeWhere(scoped);
    if (query.athleteId) await assertAthleteInScope(scoped, query.athleteId);
    const result = await evaluationRepository.list(query, scope);
    return { items: result.items.map(toDto), total: result.total };
  },

  async getById(id: string, user: AuthContext): Promise<EvaluationDto> {
    const evaluation = await evaluationRepository.findById(id);
    if (!evaluation) throw notFound('التقييم');
    await assertEvaluationScope(toScoped(user), evaluation);
    return toDto(evaluation);
  },

  async create(input: CreateEvaluationInput, user: AuthContext, meta: Meta): Promise<EvaluationDto> {
    const scoped = toScoped(user);
    // المدرب يقيّم رياضيه فقط (نطاق البيانات)
    await assertAthleteInScope(scoped, input.athleteId);
    const coachId = resolveCoachId(user, input.coachId);

    return prisma.$transaction(async (tx) => {
      const [athlete, coach, template] = await Promise.all([
        evaluationRepository.findAthleteById(input.athleteId, tx),
        evaluationRepository.findCoachById(coachId, tx),
        evaluationRepository.findTemplateById(input.templateId, tx),
      ]);
      if (!athlete) throw notFound('الرياضي');
      if (!coach) throw notFound('المدرب');
      if (!template) throw notFound('قالب التقييم');
      if (!template.isActive) throw businessRule('قالب التقييم معطّل — لا يمكن إنشاء تقييم به');

      const criteria = parseCriteria(template.criteria);
      if (criteria.length === 0) throw businessRule('قالب التقييم لا يحتوي معايير صالحة');
      validateScoresAgainstCriteria(input.scores, criteria);

      const created = await tx.evaluation.create({
        data: {
          athleteId: input.athleteId,
          templateId: input.templateId,
          coachId,
          evaluationDate: parseDateOnly(input.evaluationDate),
          scores: JSON.stringify(input.scores),
          notes: input.notes,
          createdBy: meta.user.userId,
        },
        include: {
          template: true,
          athlete: { select: { id: true, firstName: true, lastName: true, registrationNo: true } },
          coach: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'CREATE',
          entityType: ENTITY,
          entityId: created.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          after: { ...created, scores: input.scores },
        },
        tx,
      );
      return toDto(created);
    });
  },

  async update(id: string, input: UpdateEvaluationInput, user: AuthContext, meta: Meta): Promise<EvaluationDto> {
    const scoped = toScoped(user);
    return prisma.$transaction(async (tx) => {
      const current = await evaluationRepository.findById(id, tx);
      if (!current) throw notFound('التقييم');
      await assertEvaluationScope(scoped, current);

      const templateId = input.templateId ?? current.templateId;
      const template = await evaluationRepository.findTemplateById(templateId, tx);
      if (!template) throw notFound('قالب التقييم');

      const scores = input.scores ?? parseScores(current.scores);
      if (input.scores || input.templateId) {
        validateScoresAgainstCriteria(scores, parseCriteria(template.criteria));
      }
      if (input.coachId !== undefined) {
        // تغيير المدرب: المقيّد لا يستطيع تمرير تقييم لمدرب آخر
        resolveCoachId(user, input.coachId);
      }

      const updated = await tx.evaluation.update({
        where: { id },
        data: {
          ...(input.evaluationDate ? { evaluationDate: parseDateOnly(input.evaluationDate) } : {}),
          ...(input.scores ? { scores: JSON.stringify(input.scores) } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.templateId ? { templateId: input.templateId } : {}),
          ...(input.coachId ? { coachId: input.coachId } : {}),
        },
        include: {
          template: true,
          athlete: { select: { id: true, firstName: true, lastName: true, registrationNo: true } },
          coach: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: { ...current, scores: parseScores(current.scores) },
          after: { ...updated, scores: parseScores(updated.scores) },
        },
        tx,
      );
      return toDto(updated);
    });
  },

  async remove(id: string, user: AuthContext, meta: Meta): Promise<{ id: string }> {
    const scoped = toScoped(user);
    return prisma.$transaction(async (tx) => {
      const current = await evaluationRepository.findById(id, tx);
      if (!current) throw notFound('التقييم');
      await assertEvaluationScope(scoped, current);
      await tx.evaluation.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'DELETE',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: { ...current, scores: parseScores(current.scores) },
        },
        tx,
      );
      return { id };
    });
  },

  /** السلسلة الزمنية لتقدم رياضي (لرسم بياني) — مع متوسط النقاط لكل تاريخ. */
  async timeSeries(athleteId: string, user: AuthContext, templateId?: string): Promise<TimeSeriesResult> {
    await assertAthleteInScope(toScoped(user), athleteId);
    const rows = await evaluationRepository.timeSeries(athleteId, templateId);
    const points = rows.map((r) => {
      const scores = parseScores(r.scores);
      const stats = scoreStats(scores);
      return {
        evaluationId: r.id,
        date: r.evaluationDate.toISOString().slice(0, 10),
        templateId: r.templateId,
        templateName: r.template.name,
        scores,
        total: stats.total,
        average: Number(stats.average.toFixed(2)),
        coachName: `${r.coach.firstName} ${r.coach.lastName}`,
      };
    });
    return { athleteId, points };
  },

  /** تقرير مقارنة جماعية: آخر تقييم لكل رياضي + متوسطات المعايير لكل قالب. */
  async groupComparison(groupId: string, user: AuthContext): Promise<GroupComparisonResult> {
    const scoped = toScoped(user);
    const group = await evaluationRepository.findGroupById(groupId);
    if (!group) throw notFound('المجموعة');
    // المدرب المقيّد لا يرى إلا مقارنة مجموعاته (حارس IDOR → NOT_FOUND)
    if (isScopeRestricted(scoped) && group.coachId !== scoped.linkedCoachId) {
      throw notFound('المجموعة');
    }

    const athletes = await evaluationRepository.listGroupAthletes(groupId);
    const evaluations = await evaluationRepository.latestForAthletes(athletes.map((a) => a.athleteId));

    // آخر تقييم لكل (رياضي، قالب)
    const latestByAthleteTemplate = new Map<string, EvaluationWithRelations>();
    for (const e of evaluations) {
      const key = `${e.athleteId}:${e.templateId}`;
      if (!latestByAthleteTemplate.has(key)) latestByAthleteTemplate.set(key, e);
    }

    const templates = new Map<string, { name: string; criteria: Criterion[] }>();
    for (const e of latestByAthleteTemplate.values()) {
      if (!templates.has(e.templateId)) {
        templates.set(e.templateId, { name: e.template.name, criteria: parseCriteria(e.template.criteria) });
      }
    }

    const templateSummaries: TemplateComparison[] = [];
    for (const [templateId, t] of templates) {
      const rowsForTemplate = [...latestByAthleteTemplate.values()].filter((e) => e.templateId === templateId);
      const criteriaStats = t.criteria.map((c) => {
        const values = rowsForTemplate
          .map((e) => parseScores(e.scores)[c.key])
          .filter((v): v is number => typeof v === 'number');
        const sum = values.reduce((a, b) => a + b, 0);
        return {
          key: c.key,
          label: c.label,
          min: c.min,
          max: c.max,
          average: values.length > 0 ? Number((sum / values.length).toFixed(2)) : null,
          lowest: values.length > 0 ? Math.min(...values) : null,
          highest: values.length > 0 ? Math.max(...values) : null,
        };
      });
      templateSummaries.push({ templateId, templateName: t.name, evaluatedCount: rowsForTemplate.length, criteria: criteriaStats });
    }

    const athleteRows = athletes.map((a) => {
      const byTemplate: Record<string, AthleteTemplateScores> = {};
      for (const [templateId] of templates) {
        const e = latestByAthleteTemplate.get(`${a.athleteId}:${templateId}`);
        if (e) {
          const scores = parseScores(e.scores);
          byTemplate[templateId] = {
            evaluationDate: e.evaluationDate.toISOString().slice(0, 10),
            scores,
            total: scoreStats(scores).total,
          };
        }
      }
      return {
        athleteId: a.athleteId,
        registrationNo: a.registrationNo,
        name: `${a.firstName} ${a.lastName}`,
        evaluations: byTemplate,
      };
    });

    return {
      group: { id: group.id, name: group.name, code: group.code },
      totalAthletes: athletes.length,
      templates: templateSummaries,
      athletes: athleteRows,
    };
  },
};

// ---------- DTOs ----------

export interface EvaluationDto {
  id: string;
  athleteId: string;
  athleteName: string;
  registrationNo: string;
  templateId: string;
  templateName: string;
  coachId: string;
  coachName: string;
  evaluationDate: string;
  scores: Record<string, number>;
  total: number;
  average: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(e: Evaluation & {
  template: EvaluationTemplate;
  athlete: { firstName: string; lastName: string; registrationNo: string };
  coach: { firstName: string; lastName: string };
}): EvaluationDto {
  const scores = parseScores(e.scores);
  const stats = scoreStats(scores);
  return {
    id: e.id,
    athleteId: e.athleteId,
    athleteName: `${e.athlete.firstName} ${e.athlete.lastName}`,
    registrationNo: e.athlete.registrationNo,
    templateId: e.templateId,
    templateName: e.template.name,
    coachId: e.coachId,
    coachName: `${e.coach.firstName} ${e.coach.lastName}`,
    evaluationDate: e.evaluationDate.toISOString().slice(0, 10),
    scores,
    total: stats.total,
    average: Number(stats.average.toFixed(2)),
    notes: e.notes,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export interface TimeSeriesResult {
  athleteId: string;
  points: Array<{
    evaluationId: string;
    date: string;
    templateId: string;
    templateName: string;
    scores: Record<string, number>;
    total: number;
    average: number;
    coachName: string;
  }>;
}

export interface AthleteTemplateScores {
  evaluationDate: string;
  scores: Record<string, number>;
  total: number;
}

export interface TemplateComparison {
  templateId: string;
  templateName: string;
  evaluatedCount: number;
  criteria: Array<{
    key: string;
    label: string;
    min: number;
    max: number;
    average: number | null;
    lowest: number | null;
    highest: number | null;
  }>;
}

export interface GroupComparisonResult {
  group: { id: string; name: string; code: string };
  totalAthletes: number;
  templates: TemplateComparison[];
  athletes: Array<{
    athleteId: string;
    registrationNo: string;
    name: string;
    evaluations: Record<string, AthleteTemplateScores>;
  }>;
}
