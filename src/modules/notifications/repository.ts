import type { Notification, NotificationDelivery, Prisma, UserRole } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { pagination, toOrderBy } from '@/shared/api/query';
import { parseDateOnly } from '@/shared/dates';
import type { NotificationListQuery } from './schema';

type Db = typeof prisma | PrismaTransaction;

const SORTABLE = ['createdAt', 'type', 'isRead'];

/** شرط الرؤية: إشعارات موجهة للمستخدم مباشرة أو لدوره. */
export function visibilityWhere(userId: string, role: UserRole): Prisma.NotificationWhereInput {
  return {
    OR: [{ userId }, { userId: null, roleTarget: role }],
  };
}

function buildWhere(userId: string, role: UserRole, query: NotificationListQuery): Prisma.NotificationWhereInput {
  const where: Prisma.NotificationWhereInput = visibilityWhere(userId, role);
  if (query.type) where.type = query.type;
  if (query.unreadOnly === 'true') where.isRead = false;
  if (query.readOnly === 'true') where.isRead = true;
  if (query.dateFrom || query.dateTo) {
    where.createdAt = {};
    if (query.dateFrom) where.createdAt.gte = parseDateOnly(query.dateFrom);
    if (query.dateTo) {
      const end = parseDateOnly(query.dateTo);
      end.setUTCHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }
  return where;
}

export interface NotificationListResult {
  items: Notification[];
  total: number;
  unreadCount: number;
}

export const notificationRepository = {
  async listForUser(userId: string, role: UserRole, query: NotificationListQuery): Promise<NotificationListResult> {
    const where = buildWhere(userId, role, query);
    const unreadWhere = { ...visibilityWhere(userId, role), isRead: false };
    const [items, total, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: toOrderBy(query.sort, SORTABLE).length > 0
          ? toOrderBy(query.sort, SORTABLE)
          : [{ createdAt: 'desc' }],
        ...pagination(query),
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: unreadWhere }),
    ]);
    return { items, total, unreadCount };
  },

  /** إشعار واحد مرئي للمستخدم (حارس IDOR). */
  async findVisibleById(id: string, userId: string, role: UserRole, tx?: PrismaTransaction): Promise<Notification | null> {
    const client: Db = tx ?? prisma;
    return client.notification.findFirst({
      where: { id, ...visibilityWhere(userId, role) },
    });
  },

  async markRead(id: string, tx?: PrismaTransaction): Promise<number> {
    const client: Db = tx ?? prisma;
    const res = await client.notification.updateMany({
      where: { id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return res.count;
  },

  async markAllRead(userId: string, role: UserRole, tx?: PrismaTransaction): Promise<number> {
    const client: Db = tx ?? prisma;
    const res = await client.notification.updateMany({
      where: { ...visibilityWhere(userId, role), isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return res.count;
  },

  async findByDedupeKey(dedupeKey: string, tx?: PrismaTransaction): Promise<Notification | null> {
    const client: Db = tx ?? prisma;
    return client.notification.findUnique({ where: { dedupeKey } });
  },

  async create(data: Prisma.NotificationCreateInput, tx?: PrismaTransaction): Promise<Notification> {
    const client: Db = tx ?? prisma;
    return client.notification.create({ data });
  },

  async createDelivery(
    data: Prisma.NotificationDeliveryCreateInput,
    tx?: PrismaTransaction,
  ): Promise<NotificationDelivery> {
    const client: Db = tx ?? prisma;
    return client.notificationDelivery.create({ data });
  },
};
