import type { ExpenseCategory, Prisma } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { toOrderBy, pagination } from '@/shared/api/query';
import { parseDateOnly } from '@/shared/dates';
import type { ExpenseListQuery } from './schema';

const SORTABLE = ['expenseDate', 'amount', 'createdAt', 'status'];

export const expenseInclude = {
  category: { select: { id: true, name: true } },
} as const;

export type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;

function buildWhere(query: ExpenseListQuery): Prisma.ExpenseWhereInput {
  const where: Prisma.ExpenseWhereInput = { deletedAt: null };
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.employeeId) where.employeeId = query.employeeId;
  if (query.status) where.status = query.status;
  if (query.dateFrom || query.dateTo) {
    where.expenseDate = {
      ...(query.dateFrom ? { gte: parseDateOnly(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: parseDateOnly(query.dateTo) } : {}),
    };
  }
  if (query.q) {
    where.OR = [
      { description: { contains: query.q } },
      { beneficiary: { contains: query.q } },
    ];
  }
  return where;
}

export const expenseRepository = {
  async list(query: ExpenseListQuery): Promise<{ items: ExpenseRow[]; total: number }> {
    const where = buildWhere(query);
    const orderBy = toOrderBy(query.sort, SORTABLE);
    const [items, total] = await prisma.$transaction([
      prisma.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: orderBy.length > 0 ? orderBy : [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        ...pagination(query),
      }),
      prisma.expense.count({ where }),
    ]);
    return { items, total };
  },

  async findById(id: string, tx?: PrismaTransaction): Promise<ExpenseRow | null> {
    const client = tx ?? prisma;
    return client.expense.findFirst({ where: { id, deletedAt: null }, include: expenseInclude });
  },

  async findCategoryById(id: string, tx?: PrismaTransaction): Promise<ExpenseCategory | null> {
    const client = tx ?? prisma;
    return client.expenseCategory.findFirst({ where: { id } });
  },

  async findCategoryByName(
    name: string,
    excludeId?: string,
    tx?: PrismaTransaction,
  ): Promise<ExpenseCategory | null> {
    const client = tx ?? prisma;
    return client.expenseCategory.findFirst({
      where: {
        name: { equals: name },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  },

  async listCategories(): Promise<ExpenseCategory[]> {
    return prisma.expenseCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  },

  async countExpensesInCategory(categoryId: string, tx?: PrismaTransaction): Promise<number> {
    const client = tx ?? prisma;
    return client.expense.count({ where: { categoryId } });
  },

  async findEmployeeName(userId: string, tx?: PrismaTransaction): Promise<string | null> {
    const client = tx ?? prisma;
    const user = await client.user.findFirst({ where: { id: userId }, select: { fullName: true } });
    return user?.fullName ?? null;
  },
};
