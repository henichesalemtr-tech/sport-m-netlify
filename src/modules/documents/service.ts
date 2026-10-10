/**
 * خدمة وثائق الرياضيين (7.14/6.3):
 * - أنواع وثائق ديناميكية (CRUD) مع اسم فريد.
 * - رفع عبر shared/storage (فحص Magic Bytes وحد الحجم)، تنزيل/معاينة عبر مسار موثّق،
 *   حذف مرن، وتاريخ انتهاء اختياري يطلق إشعار "وثيقة قاربت على الانتهاء" (عبر مهمة مجدولة).
 */
import type { DocumentType } from '@prisma/client';
import { prisma } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { businessRule, conflict, notFound } from '@/shared/errors';
import { parseDateOnly, todayIn } from '@/shared/dates';
import { appTimeZone } from '@/shared/config/settings';
import { readFile, storeFile } from '@/shared/storage';
import {
  athleteScopeWhere,
  assertAthleteInScope,
  toScoped,
} from '@/shared/permissions/scope';
import type { AuthContext } from '@/shared/permissions/guard';
import type { Meta } from '@/shared/api/meta';
import { documentRepository, type DocumentWithRelations } from './repository';
import type {
  CreateDocumentTypeInput,
  DocumentListQuery,
  DocumentTypeListQuery,
  UpdateDocumentInput,
  UpdateDocumentTypeInput,
  UploadDocumentFields,
} from './schema';

const TYPE_ENTITY = 'DocumentType';
const ENTITY = 'AthleteDocument';

/** ملف وارد من multipart/form-data. */
export interface UploadedFileInput {
  originalName: string;
  declaredMime: string;
  buffer: Buffer;
}

export interface DocumentFile {
  bytes: Buffer;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
}

export interface DocumentDto {
  id: string;
  athleteId: string;
  athleteName: string;
  registrationNo: string;
  documentTypeId: string;
  documentTypeName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  expiryDate: string | null;
  status: string;
  createdAt: Date;
}

function toDto(d: DocumentWithRelations): DocumentDto {
  return {
    id: d.id,
    athleteId: d.athleteId,
    athleteName: `${d.athlete.firstName} ${d.athlete.lastName}`,
    registrationNo: d.athlete.registrationNo,
    documentTypeId: d.documentTypeId,
    documentTypeName: d.documentType.name,
    originalName: d.originalName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    expiryDate: d.expiryDate ? d.expiryDate.toISOString().slice(0, 10) : null,
    status: d.status,
    createdAt: d.createdAt,
  };
}

/** اسم ملف آمن للتخزين/العرض (إزالة مسارات ومحارف خطرة). */
export function sanitizeFileName(name: string): string {
  const base = name.replace(/^.*[/\\]/, '').replace(/[\u0000-\u001F<>:"|?*]/g, '_').trim();
  return base.length > 0 ? base.slice(0, 200) : 'file';
}

export const documentService = {
  // ---------- أنواع الوثائق ----------
  async listTypes(query: DocumentTypeListQuery): Promise<{ items: DocumentType[]; total: number }> {
    return documentRepository.listTypes(query);
  },

  async getTypeById(id: string): Promise<DocumentType> {
    const type = await documentRepository.findTypeById(id);
    if (!type) throw notFound('نوع الوثيقة');
    return type;
  },

  async createType(input: CreateDocumentTypeInput, meta: Meta): Promise<DocumentType> {
    return prisma.$transaction(async (tx) => {
      const duplicate = await documentRepository.findTypeByName(input.name, undefined, tx);
      if (duplicate) throw conflict('يوجد نوع وثيقة بنفس الاسم');
      const created = await tx.documentType.create({
        data: {
          name: input.name,
          isActive: input.isActive ?? true,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'CREATE',
          entityType: TYPE_ENTITY,
          entityId: created.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          after: created,
        },
        tx,
      );
      return created;
    });
  },

  async updateType(id: string, input: UpdateDocumentTypeInput, meta: Meta): Promise<DocumentType> {
    return prisma.$transaction(async (tx) => {
      const current = await documentRepository.findTypeById(id, tx);
      if (!current) throw notFound('نوع الوثيقة');
      if (input.name && input.name !== current.name) {
        const duplicate = await documentRepository.findTypeByName(input.name, id, tx);
        if (duplicate) throw conflict('يوجد نوع وثيقة بنفس الاسم');
      }
      const updated = await tx.documentType.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
      });
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: TYPE_ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: current,
          after: updated,
        },
        tx,
      );
      return updated;
    });
  },

  /** حذف نوع وثيقة — يُمنع عند وجود وثائق مرتبطة (استخدم التعطيل). */
  async removeType(id: string, meta: Meta): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const current = await documentRepository.findTypeById(id, tx);
      if (!current) throw notFound('نوع الوثيقة');
      const used = await documentRepository.countTypeDocuments(id, tx);
      if (used > 0) {
        throw businessRule(`لا يمكن حذف نوع وثيقة مرتبط بـ ${used} وثيقة — استخدم التعطيل`, { used });
      }
      await tx.documentType.delete({ where: { id } });
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'DELETE',
          entityType: TYPE_ENTITY,
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

  // ---------- الوثائق ----------
  async list(user: AuthContext, query: DocumentListQuery): Promise<{ items: DocumentDto[]; total: number }> {
    const scope = await athleteScopeWhere(toScoped(user));
    if (query.athleteId) await assertAthleteInScope(toScoped(user), query.athleteId);
    const result = await documentRepository.list(query, scope);
    return { items: result.items.map(toDto), total: result.total };
  },

  async getById(id: string, user: AuthContext): Promise<DocumentDto> {
    const doc = await documentRepository.findById(id);
    if (!doc) throw notFound('الوثيقة');
    await assertAthleteInScope(toScoped(user), doc.athleteId);
    return toDto(doc);
  },

  /** رفع وثيقة: فحص النوع/الحجم عبر storeFile (Magic Bytes) + تدقيق. */
  async upload(file: UploadedFileInput, fields: UploadDocumentFields, user: AuthContext, meta: Meta): Promise<DocumentDto> {
    await assertAthleteInScope(toScoped(user), fields.athleteId);

    const type = await documentRepository.findTypeById(fields.documentTypeId);
    if (!type) throw notFound('نوع الوثيقة');
    if (!type.isActive) throw businessRule('نوع الوثيقة معطّل — لا يمكن الرفع');

    const athlete = await prisma.athlete.findFirst({
      where: { id: fields.athleteId, deletedAt: null },
      select: { id: true },
    });
    if (!athlete) throw notFound('الرياضي');

    // التخزين يفشل بوضوح عند نوع/حجم غير مدعوم (UNSUPPORTED_FILE / FILE_TOO_LARGE)
    const stored = await storeFile(file.buffer, {
      kind: 'document',
      declaredMime: file.declaredMime || undefined,
      subdir: 'documents',
    });

    return prisma.$transaction(async (tx) => {
      const created = await tx.athleteDocument.create({
        data: {
          athleteId: fields.athleteId,
          documentTypeId: fields.documentTypeId,
          storageKey: stored.storageKey,
          originalName: sanitizeFileName(file.originalName),
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          expiryDate: fields.expiryDate ? parseDateOnly(fields.expiryDate) : null,
          status: 'ACTIVE',
          createdBy: meta.user.userId,
        },
        include: {
          documentType: true,
          athlete: { select: { id: true, firstName: true, lastName: true, registrationNo: true } },
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
          after: {
            id: created.id,
            athleteId: created.athleteId,
            documentTypeId: created.documentTypeId,
            originalName: created.originalName,
            mimeType: created.mimeType,
            sizeBytes: created.sizeBytes,
            storageKey: created.storageKey,
          },
        },
        tx,
      );
      return toDto(created);
    });
  },

  /**
   * تنزيل/معاينة: يُستدعى فقط من مسار يفحص documents.view.
   * قراءة الملف عبر readFile (حماية Path Traversal داخل طبقة التخزين).
   */
  async download(id: string, user: AuthContext): Promise<DocumentFile> {
    const doc = await documentRepository.findById(id);
    if (!doc) throw notFound('الوثيقة');
    await assertAthleteInScope(toScoped(user), doc.athleteId);
    const bytes = await readFile(doc.storageKey);
    return {
      bytes,
      mimeType: doc.mimeType,
      originalName: doc.originalName,
      sizeBytes: doc.sizeBytes,
    };
  },

  /** تحديث تاريخ الانتهاء (تمديد صلاحية). */
  async updateExpiry(id: string, input: UpdateDocumentInput, user: AuthContext, meta: Meta): Promise<DocumentDto> {
    return prisma.$transaction(async (tx) => {
      const current = await documentRepository.findById(id, tx);
      if (!current) throw notFound('الوثيقة');
      await assertAthleteInScope(toScoped(user), current.athleteId);

      const expiryDate =
        input.expiryDate === undefined
          ? current.expiryDate
          : input.expiryDate === null
            ? null
            : parseDateOnly(input.expiryDate);

      const updated = await tx.athleteDocument.update({
        where: { id },
        data: {
          expiryDate,
          // وثيقة منتهية مُدد تاريخها → تعود نشطة
          ...(expiryDate !== null && expiryDate >= parseDateOnly(todayIn(appTimeZone()))
            ? { status: 'ACTIVE' as const }
            : {}),
        },
        include: {
          documentType: true,
          athlete: { select: { id: true, firstName: true, lastName: true, registrationNo: true } },
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
          before: { expiryDate: current.expiryDate, status: current.status },
          after: { expiryDate: updated.expiryDate, status: updated.status },
        },
        tx,
      );
      return toDto(updated);
    });
  },

  /** حذف مرن: deletedAt + حالة DELETED (الملف يبقى للتدقيق/الاستعادة). */
  async remove(id: string, user: AuthContext, meta: Meta): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const current = await documentRepository.findById(id, tx);
      if (!current) throw notFound('الوثيقة');
      await assertAthleteInScope(toScoped(user), current.athleteId);
      await tx.athleteDocument.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'DELETED' },
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
          before: {
            id: current.id,
            athleteId: current.athleteId,
            originalName: current.originalName,
            storageKey: current.storageKey,
            status: current.status,
          },
        },
        tx,
      );
      return { id };
    });
  },
};
