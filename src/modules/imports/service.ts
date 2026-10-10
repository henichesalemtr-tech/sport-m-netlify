/**
 * خدمة الاستيراد (7.13):
 * رفع → تحليل → ربط أعمدة → معاينة → تحقق لكل صف → كشف تكرار → تقرير أخطاء
 * → تأكيد → استيراد بمعاملات مجزأة (Chunked) → نتيجة ("imported 184, success 180, failed 4").
 * كل عملية استيراد تُسجَّل في ImportJob + Audit.
 */
import type { ImportJob } from '@prisma/client';
import { prisma } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { businessRule, notFound, validationError } from '@/shared/errors';
import { parseDateOnly } from '@/shared/dates';
import { readFile, storeImportFile } from '@/shared/storage';
import { buildCsv } from '@/shared/export/csv';
import { getSettings } from '@/modules/settings/service';
import { generateRegistrationNumber, nextSequence } from '@/modules/athletes/registrationNumber';
import { getEntityDef, type AthleteImportRow, type ImportEntityDef } from './entities';
import { parseImportFile, suggestMapping, type ParsedSheet } from './parsing';
import { importRepository } from './repository';
import type { ImportEntity, ImportListQuery, ImportMode, PreviewQuery, SaveMappingInput } from './schema';
import type { Meta } from '@/shared/api/meta';

const ENTITY = 'ImportJob';

/** حجم الدفعة الواحدة في الاستيراد (معاملات مجزأة حتى لا يفسد فشلٌ البيانات). */
export const IMPORT_CHUNK_SIZE = 50;

export interface UploadInput {
  originalName: string;
  buffer: Buffer;
  entityType: ImportEntity;
  mode: ImportMode;
}

export interface MappingInfo {
  jobId: string;
  status: string;
  entityType: string;
  headers: string[];
  sampleRows: string[][];
  fields: Array<{ name: string; label: string; required: boolean }>;
  suggestedMapping: Record<string, number>;
  currentMapping: Record<string, number> | null;
}

export interface PreviewRow {
  rowIndex: number;
  raw: Record<string, string>;
  errors: Array<{ field: string; message: string }>;
  duplicate: boolean;
  duplicateReason: string | null;
}

export interface PreviewResult {
  jobId: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: PreviewRow[];
}

export interface ImportResultSummary {
  jobId: string;
  status: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  errorsFileKey: string | null;
  message: string;
}

interface ValidatedRow {
  rowIndex: number;
  raw: Record<string, string>;
  value: AthleteImportRow | null;
  errors: Array<{ field: string; message: string }>;
  duplicate: boolean;
  duplicateReason: string | null;
}

function parseMapping(json: string | null): Record<string, number> | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0) out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

function requireDef(entityType: string): ImportEntityDef<AthleteImportRow> {
  const def = getEntityDef(entityType);
  if (!def) throw validationError({ entityType: ['نوع كيان غير مدعوم للاستيراد'] });
  return def;
}

async function loadJob(id: string): Promise<ImportJob> {
  const job = await importRepository.findById(id);
  if (!job) throw notFound('عملية الاستيراد');
  return job;
}

async function loadSheet(job: ImportJob): Promise<ParsedSheet> {
  const buffer = await readFile(job.storageKey);
  return parseImportFile(buffer, job.fileName);
}

/** تطبيق ربط الأعمدة على الصفوف → خام {fieldName: value}. */
export function applyMapping(
  sheet: ParsedSheet,
  mapping: Record<string, number>,
): Array<{ rowIndex: number; raw: Record<string, string> }> {
  return sheet.rows.map((cells, i) => {
    const raw: Record<string, string> = {};
    for (const [field, colIdx] of Object.entries(mapping)) {
      raw[field] = (cells[colIdx] ?? '').trim();
    }
    return { rowIndex: i + 2, raw }; // +2: الترويسة (1-based)
  });
}

/** تحقق كامل + كشف تكرار (داخل الملف ومقابل القاعدة). */
async function validateRows(
  def: ImportEntityDef<AthleteImportRow>,
  mapped: Array<{ rowIndex: number; raw: Record<string, string> }>,
): Promise<ValidatedRow[]> {
  const rows: ValidatedRow[] = mapped.map((m) => {
    const validation = def.validateRow(m.raw);
    return validation.ok
      ? { ...m, value: validation.value, errors: [], duplicate: false, duplicateReason: null }
      : { ...m, value: null, errors: validation.errors, duplicate: false, duplicateReason: null };
  });

  // 1) تكرار داخل الملف نفسه (الهوية: الاسم الكامل + تاريخ الميلاد)
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (!r.value) continue;
    const key = def.duplicateKeys(r.value).identity;
    const first = seen.get(key);
    if (first !== undefined) {
      r.duplicate = true;
      r.duplicateReason = `مكرر مع الصف ${first} داخل الملف`;
    } else {
      seen.set(key, r.rowIndex);
    }
  }

  // 2) تكرار مقابل القاعدة (هاتف/بريد/اسم+تاريخ ميلاد/رقم تسجيل)
  const values = rows.filter((r) => r.value !== null).map((r) => r.value as AthleteImportRow);
  const phones = [...new Set(values.map((v) => v.phone?.replace(/\s+/g, '')).filter((p): p is string => !!p))];
  const emails = [...new Set(values.map((v) => v.email?.toLowerCase()).filter((e): e is string => !!e))];
  const existing = await importRepository.findExistingAthletes(phones, emails);
  const existingPhones = new Set(existing.map((e) => e.phone?.replace(/\s+/g, '')).filter(Boolean) as string[]);
  const existingEmails = new Set(existing.map((e) => e.email?.toLowerCase()).filter(Boolean) as string[]);

  const birthDates = [...new Set(values.map((v) => v.birthDate))].map(parseDateOnly);
  const firstNames = [...new Set(values.map((v) => v.firstName))];
  const nameMatches =
    birthDates.length > 0 && firstNames.length > 0
      ? await prisma.athlete.findMany({
          where: { deletedAt: null, birthDate: { in: birthDates }, firstName: { in: firstNames } },
          select: { firstName: true, lastName: true, birthDate: true },
        })
      : [];
  const existingIdentities = new Set(
    nameMatches.map(
      (a) => `${a.firstName.trim().toLowerCase()}|${a.lastName.trim().toLowerCase()}|${a.birthDate.toISOString().slice(0, 10)}`,
    ),
  );

  const regNos = values.map((v) => v.registrationNo).filter((r): r is string => !!r);
  const existingRegNos = new Set<string>();
  if (regNos.length > 0) {
    const found = await prisma.athlete.findMany({
      where: { registrationNo: { in: regNos } },
      select: { registrationNo: true },
    });
    for (const f of found) existingRegNos.add(f.registrationNo);
  }

  for (const r of rows) {
    if (!r.value || r.duplicate) continue;
    const keys = def.duplicateKeys(r.value);
    if (keys.phone && existingPhones.has(keys.phone)) {
      r.duplicate = true;
      r.duplicateReason = 'رياضي موجود بنفس رقم الهاتف';
    } else if (keys.email && existingEmails.has(keys.email)) {
      r.duplicate = true;
      r.duplicateReason = 'رياضي موجود بنفس البريد الإلكتروني';
    } else if (existingIdentities.has(keys.identity)) {
      r.duplicate = true;
      r.duplicateReason = 'رياضي موجود بنفس الاسم وتاريخ الميلاد';
    } else if (r.value.registrationNo && existingRegNos.has(r.value.registrationNo)) {
      r.duplicate = true;
      r.duplicateReason = 'رقم التسجيل مستخدم مسبقًا';
    }
  }

  return rows;
}

/** بناء ملف أخطاء CSV وتخزينه → مفتاح التخزين. */
async function writeErrorsFile(rows: ValidatedRow[]): Promise<string | null> {
  const errorRows = rows.filter((r) => r.errors.length > 0 || r.duplicate);
  if (errorRows.length === 0) return null;
  const columns = [
    { key: 'row', label: 'رقم الصف' },
    { key: 'field', label: 'الحقل' },
    { key: 'error', label: 'الخطأ' },
    { key: 'data', label: 'البيانات الأصلية' },
  ];
  const csvRows: Record<string, string | number>[] = [];
  for (const r of errorRows) {
    const data = JSON.stringify(r.raw);
    if (r.errors.length === 0 && r.duplicate) {
      csvRows.push({ row: r.rowIndex, field: '-', error: r.duplicateReason ?? 'مكرر', data });
    }
    for (const e of r.errors) {
      csvRows.push({ row: r.rowIndex, field: e.field, error: e.message, data });
    }
  }
  const csv = buildCsv(columns, csvRows);
  const stored = await storeImportFile(Buffer.from(csv, 'utf8'), 'errors.csv');
  return stored.storageKey;
}

export const importService = {
  /** 1) رفع الملف وبدء عملية استيراد. */
  async upload(input: UploadInput, meta: Meta): Promise<ImportJob> {
    const def = requireDef(input.entityType);
    const stored = await storeImportFile(input.buffer, input.originalName);
    // نُحلل الملف فورًا لعدّ الصفوف (فشل التحليل = ملف غير صالح)
    const parsed = await parseImportFile(await readFile(stored.storageKey), input.originalName);
    if (parsed.headers.length === 0) {
      throw businessRule('الملف لا يحتوي ترويسة أعمدة صالحة');
    }

    return prisma.$transaction(async (tx) => {
      const job = await tx.importJob.create({
        data: {
          entityType: def.entityType,
          fileName: input.originalName.slice(0, 200),
          storageKey: stored.storageKey,
          status: 'UPLOADED',
          totalRows: parsed.rows.length,
          mode: input.mode,
          createdBy: meta.user.userId,
        },
      });
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'IMPORT',
          entityType: ENTITY,
          entityId: job.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          metadata: { stage: 'upload', fileName: input.originalName, entityType: def.entityType, mode: input.mode },
        },
        tx,
      );
      return job;
    });
  },

  /** 2) معلومات ربط الأعمدة (ترويسات + عينات + اقتراح تلقائي). */
  async getMappingInfo(id: string): Promise<MappingInfo> {
    const job = await loadJob(id);
    const def = requireDef(job.entityType);
    const sheet = await loadSheet(job);
    if (sheet.headers.length === 0) {
      throw businessRule('الملف لا يحتوي ترويسة أعمدة صالحة');
    }
    return {
      jobId: job.id,
      status: job.status,
      entityType: job.entityType,
      headers: sheet.headers,
      sampleRows: sheet.rows.slice(0, 5),
      fields: def.fields.map((f) => ({ name: f.name, label: f.label, required: f.required })),
      suggestedMapping: suggestMapping(sheet.headers, def.fields),
      currentMapping: parseMapping(job.columnMapping),
    };
  },

  /** 3) حفظ ربط الأعمدة (التحقق من الحقول الإلزامية وحدود الأعمدة). */
  async saveMapping(id: string, input: SaveMappingInput, meta: Meta): Promise<ImportJob> {
    const job = await loadJob(id);
    if (job.status !== 'UPLOADED' && job.status !== 'MAPPED' && job.status !== 'PREVIEWED') {
      throw businessRule('لا يمكن تغيير ربط الأعمدة بعد بدء الاستيراد');
    }
    const def = requireDef(job.entityType);
    const sheet = await loadSheet(job);

    const fieldErrors: Record<string, string[]> = {};
    for (const f of def.fields) {
      if (f.required && !(f.name in input.mapping)) {
        fieldErrors[`mapping.${f.name}`] = [`ربط الحقل الإلزامي "${f.label}" مطلوب`];
      }
    }
    for (const [field, colIdx] of Object.entries(input.mapping)) {
      if (!def.fields.some((f) => f.name === field)) {
        fieldErrors[`mapping.${field}`] = ['حقل غير معروف'];
      }
      if (colIdx >= sheet.headers.length) {
        fieldErrors[`mapping.${field}`] = ['فهرس العمود خارج حدود الملف'];
      }
    }
    if (Object.keys(fieldErrors).length > 0) throw validationError(fieldErrors);

    return prisma.$transaction(async (tx) => {
      const updated = await importRepository.update(
        id,
        { columnMapping: JSON.stringify(input.mapping), status: 'MAPPED' },
        tx,
      );
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'IMPORT',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          metadata: { stage: 'mapping', mapping: input.mapping },
        },
        tx,
      );
      return updated;
    });
  },

  /** 4) المعاينة: تحقق لكل صف + كشف تكرار + ملخص. */
  async preview(id: string, query: PreviewQuery, meta: Meta): Promise<PreviewResult> {
    const job = await loadJob(id);
    if (job.status === 'UPLOADED') throw businessRule('احفظ ربط الأعمدة قبل المعاينة');
    if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
      throw businessRule('عملية الاستيراد منتهية — لا يمكن معاينتها');
    }
    const mapping = parseMapping(job.columnMapping);
    if (!mapping) throw businessRule('ربط الأعمدة غير محفوظ');

    const def = requireDef(job.entityType);
    const sheet = await loadSheet(job);
    const mapped = applyMapping(sheet, mapping);
    const rows = await validateRows(def, mapped);

    const invalidRows = rows.filter((r) => r.errors.length > 0).length;
    const duplicateRows = rows.filter((r) => r.duplicate && r.errors.length === 0).length;

    const updated = await importRepository.update(id, { status: 'PREVIEWED', totalRows: rows.length });
    await writeAudit(
      {
        userId: meta.user.userId,
        action: 'IMPORT',
        entityType: ENTITY,
        entityId: id,
        requestId: meta.requestId,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { stage: 'preview', totalRows: rows.length, invalidRows, duplicateRows },
      },
    );

    return {
      jobId: updated.id,
      totalRows: rows.length,
      validRows: rows.length - invalidRows - duplicateRows,
      invalidRows,
      duplicateRows,
      rows: rows.slice(0, query.limit).map((r) => ({
        rowIndex: r.rowIndex,
        raw: r.raw,
        errors: r.errors,
        duplicate: r.duplicate,
        duplicateReason: r.duplicateReason,
      })),
    };
  },

  /**
   * 5) التأكيد والتنفيذ: معاملات مجزأة (IMPORT_CHUNK_SIZE صفًا لكل معاملة).
   * - skip_invalid: تتخطى الصفوف الباطلة/المكررة وتكمل.
   * - abort_on_error: أي صف باطل يوقف الكل قبل التنفيذ (لا يُستورد شيء).
   * ملاحظة: إذا انقطعت العملية (حالة VALIDATING) يمكن إعادة التأكيد —
   * الإدراجات محكومة بقيود فريدة (registrationNo) فلا يفسد التكرار البيانات.
   */
  async confirm(id: string, meta: Meta): Promise<ImportResultSummary> {
    const job = await loadJob(id);
    if (job.status !== 'PREVIEWED' && job.status !== 'VALIDATING') {
      throw businessRule('يجب معاينة عملية الاستيراد قبل التأكيد');
    }
    const mapping = parseMapping(job.columnMapping);
    if (!mapping) throw businessRule('ربط الأعمدة غير محفوظ');
    const def = requireDef(job.entityType);

    await importRepository.update(id, { status: 'VALIDATING' });

    const sheet = await loadSheet(job);
    const rows = await validateRows(def, applyMapping(sheet, mapping));

    const importable = rows.filter((r) => r.value !== null && !r.duplicate);
    const rejected = rows.filter((r) => r.value === null || r.duplicate);

    // abort_on_error: أي صف مرفوض → فشل كامل دون استيراد شيء
    if (job.mode === 'abort_on_error' && rejected.length > 0) {
      const errorsFileKey = await writeErrorsFile(rows);
      const failed = await importRepository.update(id, {
        status: 'FAILED',
        totalRows: rows.length,
        successRows: 0,
        failedRows: rows.length,
        errorsFileKey,
        completedAt: new Date(),
      });
      await writeAudit({
        userId: meta.user.userId,
        action: 'IMPORT',
        entityType: ENTITY,
        entityId: id,
        requestId: meta.requestId,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { stage: 'confirm', mode: job.mode, result: 'aborted', failedRows: rows.length },
      });
      return summarize(failed, 'أُلغي الاستيراد: وُجدت صفوف غير صالحة (وضع abort_on_error)');
    }

    // توليد أرقام تسجيل للصفوف التي بلا رقم
    const settings = await getSettings();
    const year = new Date().getFullYear();
    const prefix = `ATH-${year}-`;
    const existingNumbers = await importRepository.listRegistrationNosByPrefix(prefix);
    let sequence = nextSequence(existingNumbers, settings.athletesRegistrationFormat);

    let success = 0;
    const failures: ValidatedRow[] = [...rejected];

    // معاملات مجزأة: فشل دفعة لا يفسد بقية البيانات
    for (let i = 0; i < importable.length; i += IMPORT_CHUNK_SIZE) {
      const chunk = importable.slice(i, i + IMPORT_CHUNK_SIZE);
      try {
        await prisma.$transaction(async (tx) => {
          for (const row of chunk) {
            const v = row.value as AthleteImportRow;
            const registrationNo = v.registrationNo ?? generateRegistrationNumber(settings.athletesRegistrationFormat, {
              year,
              month: new Date().getMonth() + 1,
              sequence,
            });
            if (!v.registrationNo) sequence += 1;
            await tx.athlete.create({
              data: {
                registrationNo,
                firstName: v.firstName,
                lastName: v.lastName,
                birthDate: parseDateOnly(v.birthDate),
                gender: v.gender,
                phone: v.phone ?? null,
                email: v.email ?? null,
                address: v.address ?? null,
                notes: v.notes ?? null,
                registrationDate: new Date(),
                status: 'ACTIVE',
                createdBy: meta.user.userId,
              },
            });
          }
        });
        success += chunk.length;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'فشل غير معروف';
        for (const row of chunk) {
          failures.push({
            ...row,
            value: row.value,
            errors: [{ field: '_', message: `فشلت دفعة الاستيراد: ${message}` }],
            duplicate: false,
            duplicateReason: null,
          });
        }
        if (job.mode === 'abort_on_error') break;
      }
    }

    const errorsFileKey = failures.length > 0 ? await writeErrorsFile(failures) : null;
    const completed = await importRepository.update(id, {
      status: success > 0 || failures.length === 0 ? 'COMPLETED' : 'FAILED',
      totalRows: rows.length,
      successRows: success,
      failedRows: failures.length,
      errorsFileKey,
      completedAt: new Date(),
    });

    await writeAudit({
      userId: meta.user.userId,
      action: 'IMPORT',
      entityType: ENTITY,
      entityId: id,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        stage: 'confirm',
        mode: job.mode,
        entityType: def.entityType,
        totalRows: rows.length,
        successRows: success,
        failedRows: failures.length,
      },
    });

    return summarize(completed, `imported ${rows.length}, success ${success}, failed ${failures.length}`);
  },

  /** 6) قائمة عمليات الاستيراد. */
  async list(query: ImportListQuery): Promise<{ items: ImportJob[]; total: number }> {
    return importRepository.list(query);
  },

  async getById(id: string): Promise<ImportJob> {
    return loadJob(id);
  },

  /** قالب CSV قابل للتنزيل (UTF-8 BOM) حسب نوع الكيان. */
  async template(entityType: ImportEntity): Promise<{ fileName: string; csv: string }> {
    const def = requireDef(entityType);
    const columns = def.templateHeaders.map((h, i) => ({ key: `c${i}`, label: h }));
    const row: Record<string, string> = {};
    def.templateExample.forEach((v, i) => {
      row[`c${i}`] = v;
    });
    return {
      fileName: `import-template-${entityType}.csv`,
      csv: buildCsv(columns, [row]),
    };
  },

  /** ملف الأخطاء للتنزيل (بعد التأكيد). */
  async errorsFile(id: string): Promise<{ bytes: Buffer; fileName: string }> {
    const job = await loadJob(id);
    if (!job.errorsFileKey) throw notFound('ملف الأخطاء');
    const bytes = await readFile(job.errorsFileKey);
    return { bytes, fileName: `import-errors-${job.id}.csv` };
  },
};

function summarize(job: ImportJob, message: string): ImportResultSummary {
  return {
    jobId: job.id,
    status: job.status,
    totalRows: job.totalRows,
    successRows: job.successRows,
    failedRows: job.failedRows,
    errorsFileKey: job.errorsFileKey,
    message,
  };
}
