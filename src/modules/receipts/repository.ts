import type { Prisma, Receipt } from '@prisma/client';
import { lockNamed, prisma, type PrismaTransaction } from '@/shared/db/client';

export const receiptInclude = {
  payment: {
    include: {
      paymentMethod: { select: { id: true, name: true } },
      athlete: { select: { id: true, registrationNo: true, firstName: true, lastName: true } },
      subscription: {
        include: { subscriptionType: { select: { id: true, name: true, kind: true } } },
      },
    },
  },
} as const;

export type ReceiptRow = Prisma.ReceiptGetPayload<{ include: typeof receiptInclude }>;

export const receiptRepository = {
  async findById(id: string, tx?: PrismaTransaction): Promise<ReceiptRow | null> {
    const client = tx ?? prisma;
    return client.receipt.findFirst({ where: { id }, include: receiptInclude });
  },

  async findByPaymentId(paymentId: string, tx?: PrismaTransaction): Promise<ReceiptRow | null> {
    const client = tx ?? prisma;
    return client.receipt.findFirst({ where: { paymentId }, include: receiptInclude });
  },

  /** قفل تسلسلي لكل سنة مالية يمنع توليد رقمين متطابقين/فجوات عند التزامن. */
  async lockFiscalYear(fiscalYear: number, tx: PrismaTransaction): Promise<void> {
    await lockNamed(tx, `receipts:${fiscalYear}`);
  },

  /** كل أرقام التسلسل الصادرة لسنة مالية (بترتيب تصاعدي) — داخل المعاملة بعد القفل. */
  async findSequencesForFiscalYear(fiscalYear: number, tx: PrismaTransaction): Promise<number[]> {
    const rows = await tx.$queryRaw<{ sequence: number }[]>`
      SELECT sequence FROM receipts WHERE fiscal_year = ${fiscalYear} ORDER BY sequence ASC
    `;
    return rows.map((r) => r.sequence);
  },

  async create(
    data: {
      receiptNo: string;
      fiscalYear: number;
      sequence: number;
      paymentId: string;
      template: string;
    },
    tx: PrismaTransaction,
  ): Promise<Receipt> {
    return tx.receipt.create({
      data: {
        receiptNo: data.receiptNo,
        fiscalYear: data.fiscalYear,
        sequence: data.sequence,
        paymentId: data.paymentId,
        status: 'COMPLETED',
        template: data.template,
      },
    });
  },

  async markVoided(receiptId: string, tx: PrismaTransaction): Promise<void> {
    await tx.receipt.updateMany({
      where: { id: receiptId },
      data: { status: 'VOIDED' },
    });
  },

  async incrementReprint(id: string, tx: PrismaTransaction): Promise<Receipt> {
    await tx.receipt.update({
      where: { id },
      data: { reprintCount: { increment: 1 }, lastReprintAt: new Date() },
    });
    return tx.receipt.findUniqueOrThrow({ where: { id } });
  },

  async findEmployeeName(userId: string, tx?: PrismaTransaction): Promise<string | null> {
    const client = tx ?? prisma;
    const user = await client.user.findFirst({
      where: { id: userId },
      select: { fullName: true },
    });
    return user?.fullName ?? null;
  },
};
