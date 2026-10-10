import type { ExpenseCategory } from '@prisma/client';
import { prisma } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { AppError, ErrorCode, notFound, businessRule, conflict } from '@/shared/errors';
import type { Meta } from '@/shared/api/meta';
import { toMinorUnits, type MinorUnits } from '@/shared/money';
import { parseDateOnly, todayIn } from '@/shared/dates';
import { getSettings } from '@/modules/settings/service';
import { cashService } from '@/modules/cash/service';
import { expenseRepository, type ExpenseRow } from './repository';
import type {
  CreateExpenseInput,
  UpdateExpenseInput,
  VoidExpenseInput,
  ExpenseListQuery,
  CreateExpenseCategoryInput,
  UpdateExpenseCategoryInput,
} from './schema';

const big = (v: MinorUnits): string => v.toString();

/** JSON لا يدعم BigInt — يُحوَّل لنص في Audit والـ DTO. */
function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as T;
}

export interface ExpenseDto {
  id: string;
  amount: string;
  categoryId: string;
  categoryName: string;
  expenseDate: Date;
  description: string | null;
  beneficiary: string | null;
  employeeId: string | null;
  employeeName: string | null;
  status: ExpenseRow['status'];
  voidReason: string | null;
  attachments: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

function parseAttachments(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return []; // قيمة تالفة — تعرض قائمة فارغة بدل الانهيار
  }
}

async function toExpenseDto(e: ExpenseRow): Promise<ExpenseDto> {
  return {
    id: e.id,
    amount: big(e.amount),
    categoryId: e.categoryId,
    categoryName: e.category.name,
    expenseDate: e.expenseDate,
    description: e.description,
    beneficiary: e.beneficiary,
    employeeId: e.employeeId,
    employeeName: e.employeeId ? await expenseRepository.findEmployeeName(e.employeeId) : null,
    status: e.status,
    voidReason: e.voidReason,
    attachments: parseAttachments(e.attachments),
    version: e.version,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

const versionConflictError = () =>
  new AppError(ErrorCode.VERSION_CONFLICT, 'تم تعديل السجل من مستخدم آخر، حدّث الصفحة وحاول مجددًا');

export const expenseService = {
  async list(query: ExpenseListQuery): Promise<{ items: ExpenseDto[]; total: number }> {
    const result = await expenseRepository.list(query);
    return { items: await Promise.all(result.items.map(toExpenseDto)), total: result.total };
  },

  async getById(id: string): Promise<ExpenseDto> {
    const expense = await expenseRepository.findById(id);
    if (!expense) throw notFound('المصروف');
    return toExpenseDto(expense);
  },

  /** إنشاء مصروف + قيد خزينة EXPENSE + Audit في معاملة واحدة (7.12). */
  async create(input: CreateExpenseInput, meta: Meta): Promise<ExpenseDto> {
    const settings = await getSettings();
    const amount = toMinorUnits(input.amount, settings.currencyDecimals);
    if (amount <= 0n) {
      throw new AppError(ErrorCode.INVALID_AMOUNT, 'مبلغ المصروف يجب أن يكون أكبر من صفر');
    }
    const expenseDate = parseDateOnly(input.expenseDate);

    return prisma.$transaction(async (tx) => {
      const category = await expenseRepository.findCategoryById(input.categoryId, tx);
      if (!category) throw notFound('فئة المصروف');
      if (!category.isActive) throw businessRule('فئة المصروف معطلة');

      const expense = await tx.expense.create({
        data: {
          amount,
          categoryId: category.id,
          expenseDate,
          description: input.description ?? null,
          beneficiary: input.beneficiary ?? null,
          employeeId: input.employeeId ?? null,
          status: 'ACTIVE',
          attachments: input.attachments ? JSON.stringify(input.attachments) : null,
          createdBy: meta.user.userId,
          updatedBy: meta.user.userId,
        },
        include: { category: { select: { id: true, name: true } } },
      });

      const cashEntry = await cashService.appendEntry(tx, {
        type: 'EXPENSE',
        amount, // قيمة مطلقة — الدفتر يقيدها سالبة
        referenceType: 'expense',
        referenceId: expense.id,
        reason: input.description ?? `مصروف — ${category.name}`,
        txDate: expenseDate,
        createdBy: meta.user.userId,
      });

      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'CREATE',
          entityType: 'Expense',
          entityId: expense.id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          after: jsonSafe(expense),
          metadata: { cashTransactionId: cashEntry.id, balanceAfter: big(cashEntry.balanceAfter) },
        },
        tx,
      );
      return toExpenseDto(expense);
    });
  },

  /**
   * تعديل مصروف نشط — تغيير المبلغ يتم بقيود تصحيحية في الدفتر
   * (عكس القديم + قيد الجديد) ولا يعدّل التاريخ المالي أبدًا (7.12).
   */
  async update(id: string, input: UpdateExpenseInput, meta: Meta): Promise<ExpenseDto> {
    const { version, ...data } = input;
    const settings = await getSettings();

    return prisma.$transaction(async (tx) => {
      const current = await expenseRepository.findById(id, tx);
      if (!current) throw notFound('المصروف');
      if (current.status === 'VOIDED') {
        throw businessRule('لا يمكن تعديل مصروف ملغى — أنشئ مصروفًا جديدًا');
      }

      if (data.categoryId && data.categoryId !== current.categoryId) {
        const category = await expenseRepository.findCategoryById(data.categoryId, tx);
        if (!category) throw notFound('فئة المصروف');
        if (!category.isActive) throw businessRule('فئة المصروف معطلة');
      }

      const nextExpenseDate = data.expenseDate ? parseDateOnly(data.expenseDate) : current.expenseDate;
      let nextAmount = current.amount;
      if (data.amount !== undefined) {
        nextAmount = toMinorUnits(data.amount, settings.currencyDecimals);
        if (nextAmount <= 0n) {
          throw new AppError(ErrorCode.INVALID_AMOUNT, 'مبلغ المصروف يجب أن يكون أكبر من صفر');
        }
      }

      // قيود تصحيحية عند تغيير المبلغ أو التاريخ (الدفتر Append-Only)
      const amountChanged = nextAmount !== current.amount;
      const dateChanged = nextExpenseDate.getTime() !== current.expenseDate.getTime();
      if (amountChanged || dateChanged) {
        await cashService.appendEntry(tx, {
          type: 'REVERSAL',
          amount: current.amount, // عكس مصروف = موجب
          referenceType: 'expense',
          referenceId: current.id,
          reason: `تصحيح مصروف — إلغاء القيد الأصلي${amountChanged ? ` (مبلغ ${big(current.amount)})` : ''}`,
          txDate: nextExpenseDate,
          createdBy: meta.user.userId,
        });
        await cashService.appendEntry(tx, {
          type: 'EXPENSE',
          amount: nextAmount,
          referenceType: 'expense',
          referenceId: current.id,
          reason: data.description ?? current.description ?? `مصروف (تصحيح)`,
          txDate: nextExpenseDate,
          createdBy: meta.user.userId,
        });
      }

      const res = await tx.expense.updateMany({
        where: { id, version, deletedAt: null },
        data: {
          amount: nextAmount,
          categoryId: data.categoryId ?? current.categoryId,
          expenseDate: nextExpenseDate,
          description: data.description !== undefined ? data.description : current.description,
          beneficiary: data.beneficiary !== undefined ? data.beneficiary : current.beneficiary,
          employeeId: data.employeeId !== undefined ? data.employeeId : current.employeeId,
          attachments:
            data.attachments !== undefined ? JSON.stringify(data.attachments) : current.attachments,
          updatedBy: meta.user.userId,
          version: { increment: 1 },
        },
      });
      if (res.count === 0) throw versionConflictError();

      const after = await expenseRepository.findById(id, tx);
      if (!after) throw notFound('المصروف');
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: 'Expense',
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: jsonSafe(current),
          after: jsonSafe(after),
        },
        tx,
      );
      return toExpenseDto(after);
    });
  },

  /** إلغاء مصروف — يحفظ السجل والقيد العكسي في الدفتر (بلا حذف صامت — 7.12). */
  async void(id: string, input: VoidExpenseInput, meta: Meta): Promise<ExpenseDto> {
    const settings = await getSettings();
    const today = parseDateOnly(todayIn(settings.timezone));

    return prisma.$transaction(async (tx) => {
      const current = await expenseRepository.findById(id, tx);
      if (!current) throw notFound('المصروف');
      if (current.status === 'VOIDED') throw businessRule('المصروف ملغى مسبقًا');

      const res = await tx.expense.updateMany({
        where: { id, version: input.version, deletedAt: null },
        data: {
          status: 'VOIDED',
          voidReason: input.reason,
          updatedBy: meta.user.userId,
          version: { increment: 1 },
        },
      });
      if (res.count === 0) throw versionConflictError();

      // قيد عكسي بتاريخ اليوم (يوم المصروف قد يكون مقفلًا)
      await cashService.appendEntry(tx, {
        type: 'REVERSAL',
        amount: current.amount,
        referenceType: 'expense',
        referenceId: current.id,
        reason: `إلغاء مصروف: ${input.reason}`,
        txDate: today,
        createdBy: meta.user.userId,
      });

      const after = await expenseRepository.findById(id, tx);
      if (!after) throw notFound('المصروف');
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'VOID',
          entityType: 'Expense',
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: jsonSafe(current),
          after: jsonSafe(after),
          metadata: { operation: 'void', reason: input.reason },
        },
        tx,
      );
      return toExpenseDto(after);
    });
  },
};

export const expenseCategoryService = {
  async list(): Promise<ExpenseCategory[]> {
    return expenseRepository.listCategories();
  },

  async getById(id: string): Promise<ExpenseCategory> {
    const category = await expenseRepository.findCategoryById(id);
    if (!category) throw notFound('فئة المصروف');
    return category;
  },

  async create(input: CreateExpenseCategoryInput, meta: Meta): Promise<ExpenseCategory> {
    return prisma.$transaction(async (tx) => {
      const duplicate = await expenseRepository.findCategoryByName(input.name, undefined, tx);
      if (duplicate) throw conflict('توجد فئة مصروف بنفس الاسم');

      const created = await tx.expenseCategory.create({
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
          entityType: 'ExpenseCategory',
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

  async update(id: string, input: UpdateExpenseCategoryInput, meta: Meta): Promise<ExpenseCategory> {
    return prisma.$transaction(async (tx) => {
      const current = await expenseRepository.findCategoryById(id, tx);
      if (!current) throw notFound('فئة المصروف');

      if (input.name && input.name !== current.name) {
        const duplicate = await expenseRepository.findCategoryByName(input.name, id, tx);
        if (duplicate) throw conflict('توجد فئة مصروف بنفس الاسم');
      }

      const updated = await tx.expenseCategory.update({
        where: { id },
        data: {
          name: input.name ?? current.name,
          isActive: input.isActive ?? current.isActive,
          sortOrder: input.sortOrder ?? current.sortOrder,
        },
      });
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: 'ExpenseCategory',
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

  /** الحذف الفعلي مسموح فقط لفئة بلا مصروفات — وإلا فالتعطيل (بلا حذف صامت). */
  async remove(id: string, meta: Meta): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      const current = await expenseRepository.findCategoryById(id, tx);
      if (!current) throw notFound('فئة المصروف');

      const count = await expenseRepository.countExpensesInCategory(id, tx);
      if (count > 0) {
        throw businessRule(`لا يمكن حذف فئة مرتبطة بـ ${count} مصروف — استخدم التعطيل`, { count });
      }

      await tx.expenseCategory.delete({ where: { id } });
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'DELETE',
          entityType: 'ExpenseCategory',
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
};
