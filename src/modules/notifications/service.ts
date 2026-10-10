/**
 * مركز الإشعارات (7.16):
 * - قائمة/قراءة/تعليم الكل كمقروء للمستخدم الحالي (حسب المستخدم أو الدور المستهدف).
 * - توليد Idempotent عبر dedupeKey (قيد فريد) لكل نوع إشعار.
 * - القنوات الخارجية خلف Adapter (معطّلة افتراضيًا) مع تسجيل NotificationDelivery.
 */
import type { Notification, NotificationChannel, NotificationType, UserRole } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { notFound } from '@/shared/errors';
import { todayIn, addDays, parseDateOnly } from '@/shared/dates';
import { appTimeZone } from '@/shared/config/settings';
import { getSettings } from '@/modules/settings/service';
import { getAdapter } from '@/shared/notifications/adapter';
import { dedupeKeys } from './dedupe';
import { notificationRepository } from './repository';
import type { NotificationListQuery } from './schema';
import type { AuthContext } from '@/shared/permissions/guard';
import type { Meta } from '@/shared/api/meta';

const ENTITY = 'Notification';

export interface EmitNotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  /** مفتاح إلغاء التكرار — عند التكرار لا يُنشأ إشعار جديد. */
  dedupeKey?: string;
  /** مستخدم محدد أو دور كامل (أحدهما). */
  userId?: string | null;
  roleTarget?: UserRole | null;
  /** قنوات إضافية غير IN_APP (تُسجَّل Delivery حتى لو كانت القناة معطّلة). */
  channels?: NotificationChannel[];
  /** عناوين القنوات الخارجية: channel → recipient. */
  recipients?: Partial<Record<NotificationChannel, string>>;
}

export interface EmitResult {
  id: string | null;
  created: boolean;
}

/**
 * إنشاء إشعار Idempotent + تسجيل محاولات التسليم.
 * يمكن تمرير Transaction (لإنشاء الإشعار داخل نفس معاملة العملية المالية).
 */
export async function emitNotification(
  input: EmitNotificationInput,
  tx?: PrismaTransaction,
): Promise<EmitResult> {
  const client: PrismaTransaction | typeof prisma = tx ?? prisma;

  if (input.dedupeKey) {
    const existing = await notificationRepository.findByDedupeKey(input.dedupeKey, client as PrismaTransaction);
    if (existing) return { id: existing.id, created: false };
  }

  const notification = await client.notification.create({
    data: {
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      dedupeKey: input.dedupeKey ?? null,
      userId: input.userId ?? null,
      roleTarget: input.roleTarget ?? null,
    },
  });

  // تسليم داخل التطبيق: النجاح = وجود السجل نفسه
  const inAppRecipient = input.userId ?? (input.roleTarget ? `role:${input.roleTarget}` : 'broadcast');
  await client.notificationDelivery.create({
    data: {
      notificationId: notification.id,
      channel: 'IN_APP',
      recipient: inAppRecipient,
      status: 'SENT',
      attempts: 1,
      sentAt: new Date(),
    },
  });

  // القنوات الخارجية — عبر Adapter (معطّلة افتراضيًا؛ تُسجَّل النتيجة دائمًا)
  for (const channel of input.channels ?? []) {
    if (channel === 'IN_APP') continue;
    const adapter = getAdapter(channel);
    const recipient = input.recipients?.[channel];
    if (!recipient) continue;
    const result = adapter.isEnabled()
      ? await adapter.send({
          channel,
          recipient,
          title: input.title,
          body: input.body ?? '',
          referenceId: notification.id,
        })
      : { status: 'FAILED' as const, error: `قناة ${channel} غير مفعّلة` };
    await client.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel,
        recipient,
        status: result.status,
        attempts: 1,
        lastError: result.error ?? null,
        sentAt: result.status === 'SENT' ? new Date() : null,
      },
    });
  }

  return { id: notification.id, created: true };
}

export const notificationService = {
  async list(
    user: AuthContext,
    query: NotificationListQuery,
  ): Promise<{ items: Notification[]; total: number; unreadCount: number }> {
    return notificationRepository.listForUser(user.userId, user.role, query);
  },

  async markRead(id: string, user: AuthContext, meta: Meta): Promise<{ id: string; isRead: boolean }> {
    return prisma.$transaction(async (tx) => {
      const visible = await notificationRepository.findVisibleById(id, user.userId, user.role, tx);
      if (!visible) throw notFound('الإشعار');
      await notificationRepository.markRead(id, tx);
      await writeAudit(
        {
          userId: user.userId,
          action: 'UPDATE',
          entityType: ENTITY,
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: { isRead: visible.isRead },
          after: { isRead: true },
          metadata: { operation: 'mark_read' },
        },
        tx,
      );
      return { id, isRead: true };
    });
  },

  async markAllRead(user: AuthContext, meta: Meta): Promise<{ marked: number }> {
    return prisma.$transaction(async (tx) => {
      const marked = await notificationRepository.markAllRead(user.userId, user.role, tx);
      await writeAudit(
        {
          userId: user.userId,
          action: 'UPDATE',
          entityType: ENTITY,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          metadata: { operation: 'mark_all_read', marked },
        },
        tx,
      );
      return { marked };
    });
  },

  // ---------- مولّدات 7.16 (Idempotent عبر dedupeKey) ----------

  /** اشتراكات تنتهي خلال N يوم (من الإعدادات subscription.expiringDays). */
  async generateSubscriptionExpiring(tx?: PrismaTransaction): Promise<number> {
    const settings = await getSettings();
    const today = parseDateOnly(todayIn(settings.timezone));
    const horizon = addDays(today, settings.subscriptionExpiringDays);
    const subs = await prisma.subscription.findMany({
      where: { deletedAt: null, status: 'ACTIVE', endDate: { gte: today, lte: horizon } },
      include: { athlete: { select: { firstName: true, lastName: true } } },
      take: 500,
    });
    let created = 0;
    for (const s of subs) {
      const res = await emitNotification(
        {
          type: 'SUBSCRIPTION_EXPIRING',
          roleTarget: 'RECEPTION',
          title: 'اشتراك قارب على الانتهاء',
          body: `اشتراك ${s.athlete.firstName} ${s.athlete.lastName} ينتهي في ${todayIn(settings.timezone, s.endDate)}`,
          entityType: 'Subscription',
          entityId: s.id,
          dedupeKey: dedupeKeys.subscriptionExpiring(s.id, s.endDate, 'RECEPTION'),
        },
        tx,
      );
      if (res.created) created++;
    }
    return created;
  },

  /** اشتراكات انتهت فعلًا وما زالت بحالة ACTIVE (قبل/بعد تشغيل مهمة الانتهاء). */
  async generateSubscriptionExpired(tx?: PrismaTransaction): Promise<number> {
    const settings = await getSettings();
    const today = parseDateOnly(todayIn(settings.timezone));
    const subs = await prisma.subscription.findMany({
      where: { deletedAt: null, status: 'EXPIRED', endDate: { gte: addDays(today, -7), lt: today } },
      include: { athlete: { select: { firstName: true, lastName: true } } },
      take: 500,
    });
    let created = 0;
    for (const s of subs) {
      const res = await emitNotification(
        {
          type: 'SUBSCRIPTION_EXPIRED',
          roleTarget: 'RECEPTION',
          title: 'انتهى اشتراك',
          body: `انتهى اشتراك ${s.athlete.firstName} ${s.athlete.lastName}`,
          entityType: 'Subscription',
          entityId: s.id,
          dedupeKey: dedupeKeys.subscriptionExpired(s.id, s.endDate, 'RECEPTION'),
        },
        tx,
      );
      if (res.created) created++;
    }
    return created;
  },

  /** ديون متأخرة: اشتراكات تجاوزت تاريخ الاستحقاق وبقي عليها رصيد. */
  async generateOverdueDebts(tx?: PrismaTransaction): Promise<number> {
    const settings = await getSettings();
    const today = parseDateOnly(todayIn(settings.timezone));
    const subs = await prisma.subscription.findMany({
      where: { deletedAt: null, dueDate: { lt: today }, status: { in: ['ACTIVE', 'EXPIRED'] } },
      include: { athlete: { select: { firstName: true, lastName: true } } },
      take: 500,
    });
    let created = 0;
    for (const s of subs) {
      if (s.netAmount - s.paidAmount <= 0n) continue;
      const res = await emitNotification(
        {
          type: 'OVERDUE_DEBT',
          roleTarget: 'ACCOUNTANT',
          title: 'دين متأخر',
          body: `على ${s.athlete.firstName} ${s.athlete.lastName} رصيد مستحق تجاوز تاريخ ${todayIn(settings.timezone, s.dueDate)}`,
          entityType: 'Subscription',
          entityId: s.id,
          dedupeKey: dedupeKeys.overdueDebt(s.id, s.dueDate, 'ACCOUNTANT'),
        },
        tx,
      );
      if (res.created) created++;
    }
    return created;
  },

  /** حصص قادمة خلال N ساعة (افتراضي 24) — تُوجّه لمدرب الحصة إن وجد وإلا للاستقبال. */
  async generateUpcomingSessions(hoursAhead = 24, tx?: PrismaTransaction): Promise<number> {
    const now = new Date();
    const horizon = new Date(now.getTime() + hoursAhead * 3_600_000);
    const sessions = await prisma.trainingSession.findMany({
      where: { deletedAt: null, status: 'SCHEDULED', startTime: { gte: now, lte: horizon } },
      select: { id: true, title: true, startTime: true, coachId: true },
      take: 500,
    });
    let created = 0;
    for (const s of sessions) {
      const targetUser = s.coachId
        ? await prisma.user.findFirst({
            where: { linkedCoachId: s.coachId, deletedAt: null, status: 'ACTIVE' },
            select: { id: true },
          })
        : null;
      const target = targetUser?.id ?? 'RECEPTION';
      const res = await emitNotification(
        {
          type: 'UPCOMING_SESSION',
          userId: targetUser?.id ?? null,
          roleTarget: targetUser ? null : 'RECEPTION',
          title: 'حصة قادمة',
          body: `${s.title} — ${s.startTime.toISOString()}`,
          entityType: 'TrainingSession',
          entityId: s.id,
          dedupeKey: dedupeKeys.upcomingSession(s.id, target),
        },
        tx,
      );
      if (res.created) created++;
    }
    return created;
  },

  /** وثائق رياضيين تقترب انتهاء صلاحيتها (خلال days يومًا) + تحديث حالة المنتهية. */
  async generateDocumentExpiring(days = 30, tx?: PrismaTransaction): Promise<number> {
    const settings = await getSettings();
    const today = parseDateOnly(todayIn(settings.timezone));
    const horizon = addDays(today, days);

    // 1) وثائق تجاوزت expiryDate → EXPIRED
    await prisma.athleteDocument.updateMany({
      where: { deletedAt: null, status: 'ACTIVE', expiryDate: { lt: today } },
      data: { status: 'EXPIRED' },
    });

    // 2) وثائق تقترب → إشعار DOCUMENT_EXPIRING
    const docs = await prisma.athleteDocument.findMany({
      where: { deletedAt: null, status: 'ACTIVE', expiryDate: { gte: today, lte: horizon } },
      include: { athlete: { select: { firstName: true, lastName: true } }, documentType: { select: { name: true } } },
      take: 500,
    });
    let created = 0;
    for (const d of docs) {
      const res = await emitNotification(
        {
          type: 'DOCUMENT_EXPIRING',
          roleTarget: 'RECEPTION',
          title: 'وثيقة قاربت على الانتهاء',
          body: `${d.documentType.name} الخاصة بـ ${d.athlete.firstName} ${d.athlete.lastName} تنتهي في ${d.expiryDate ? todayIn(settings.timezone, d.expiryDate) : ''}`,
          entityType: 'AthleteDocument',
          entityId: d.id,
          dedupeKey: dedupeKeys.documentExpiring(d.id, d.expiryDate ?? today),
        },
        tx,
      );
      if (res.created) created++;
    }
    return created;
  },

  /** دفعة جديدة — تُستدعى من وحدة المدفوعات داخل نفس معاملة الدفع. */
  async emitNewPayment(
    payment: { id: string; athleteName: string; amountText: string },
    tx?: PrismaTransaction,
  ): Promise<EmitResult> {
    return emitNotification(
      {
        type: 'NEW_PAYMENT',
        roleTarget: 'ACCOUNTANT',
        title: 'دفعة جديدة',
        body: `استُلمت دفعة ${payment.amountText} من ${payment.athleteName}`,
        entityType: 'Payment',
        entityId: payment.id,
        dedupeKey: dedupeKeys.newPayment(payment.id),
      },
      tx,
    );
  },
};

export { emitNotification as emit };
