import type { Receipt } from '@prisma/client';
import { prisma, type PrismaTransaction } from '@/shared/db/client';
import { writeAudit } from '@/shared/audit';
import { notFound, isAppError, ErrorCode } from '@/shared/errors';
import type { Meta } from '@/shared/api/meta';
import type { MinorUnits } from '@/shared/money';
import { getSettings, settingsService } from '@/modules/settings/service';
import { receiptRepository, type ReceiptRow } from './repository';
import { formatReceiptNo, nextReceiptSequence } from './logic';

const big = (v: MinorUnits): string => v.toString();

export interface ReceiptOrgInfo {
  name: string;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
}

export interface ReceiptViewDto {
  id: string;
  receiptNo: string;
  fiscalYear: number;
  sequence: number;
  status: Receipt['status'];
  /** وصل ملغى → يُطبع عليه "ملغى" (void). */
  isVoid: boolean;
  /** إعادة طباعة → تُعلَّم "نسخة" (copy). */
  isCopy: boolean;
  reprintCount: number;
  lastReprintAt: Date | null;
  template: string;
  org: ReceiptOrgInfo;
  transactionNo: string | null;
  athleteName: string | null;
  registrationNo: string | null;
  subscription: {
    id: string;
    typeName: string;
    startDate: Date;
    endDate: Date;
  } | null;
  amount: string | null;
  discount: string | null;
  netAmount: string | null;
  methodName: string | null;
  paymentDate: Date | null;
  employeeName: string | null;
  createdAt: Date;
}

/** قراءة بيانات المنظمة للوصل — مفاتيح اختيارية بقيمة null عند الغياب. */
async function readStringSetting(key: string): Promise<string | null> {
  try {
    const dto = await settingsService.get(key);
    return typeof dto.value === 'string' && dto.value.trim() ? dto.value : null;
  } catch (e) {
    if (isAppError(e) && e.code === ErrorCode.NOT_FOUND) return null;
    throw e;
  }
}

export async function readReceiptOrgInfo(): Promise<ReceiptOrgInfo> {
  const settings = await getSettings();
  const [address, phone, logoUrl] = await Promise.all([
    readStringSetting('org.address'),
    readStringSetting('org.phone'),
    readStringSetting('org.logoUrl'),
  ]);
  return { name: settings.orgName || '', address, phone, logoUrl };
}

async function toReceiptViewDto(row: ReceiptRow, isCopy: boolean): Promise<ReceiptViewDto> {
  const p = row.payment;
  const employeeName = p?.createdBy
    ? await receiptRepository.findEmployeeName(p.createdBy)
    : null;
  const org = await readReceiptOrgInfo();
  return {
    id: row.id,
    receiptNo: row.receiptNo,
    fiscalYear: row.fiscalYear,
    sequence: row.sequence,
    status: row.status,
    isVoid: row.status === 'VOIDED',
    isCopy,
    reprintCount: row.reprintCount,
    lastReprintAt: row.lastReprintAt,
    template: row.template,
    org,
    transactionNo: p?.transactionNo ?? null,
    athleteName: p ? `${p.athlete.firstName} ${p.athlete.lastName}` : null,
    registrationNo: p?.athlete.registrationNo ?? null,
    subscription: p
      ? {
          id: p.subscription.id,
          typeName: p.subscription.subscriptionType.name,
          startDate: p.subscription.startDate,
          endDate: p.subscription.endDate,
        }
      : null,
    amount: p ? big(p.amount) : null,
    discount: p ? big(p.discount) : null,
    netAmount: p ? big(p.netAmount) : null,
    methodName: p?.paymentMethod.name ?? null,
    paymentDate: p?.paymentDate ?? null,
    employeeName,
    createdAt: row.createdAt,
  };
}

export const receiptService = {
  /**
   * إنشاء وصل لدفعة داخل نفس معاملة الدفعة (7.11) —
   * تسلسل بلا فجوات لكل سنة مالية: قفل استشاري بمفتاح السنة ثم max(sequence)+1.
   * أي فشل يُلغي المعاملة كاملة (الدفعة + القيد + الوصل).
   */
  async createInTx(
    tx: PrismaTransaction,
    args: { paymentId: string; fiscalYear: number; template: string },
  ): Promise<Receipt> {
    await receiptRepository.lockFiscalYear(args.fiscalYear, tx);
    const sequences = await receiptRepository.findSequencesForFiscalYear(args.fiscalYear, tx);
    const sequence = nextReceiptSequence(sequences);
    return receiptRepository.create(
      {
        receiptNo: formatReceiptNo(args.fiscalYear, sequence),
        fiscalYear: args.fiscalYear,
        sequence,
        paymentId: args.paymentId,
        template: args.template,
      },
      tx,
    );
  },

  /** وسم وصل كملغى داخل معاملة إلغاء الدفعة — لا يُحذف الوصل (بلا فجوات). */
  async voidInTx(tx: PrismaTransaction, receiptId: string): Promise<void> {
    await receiptRepository.markVoided(receiptId, tx);
  },

  async getById(id: string): Promise<ReceiptViewDto> {
    const row = await receiptRepository.findById(id);
    if (!row) throw notFound('الوصل');
    return toReceiptViewDto(row, false);
  },

  async getByPaymentId(paymentId: string): Promise<ReceiptViewDto> {
    const row = await receiptRepository.findByPaymentId(paymentId);
    if (!row) throw notFound('الوصل');
    return toReceiptViewDto(row, false);
  },

  /**
   * إعادة الطباعة: لا تغيّر الرقم/المحتوى — تعلَّم "نسخة"،
   * تزيد reprintCount، وتُسجَّل في Audit.
   */
  async reprint(id: string, meta: Meta): Promise<ReceiptViewDto> {
    return prisma.$transaction(async (tx) => {
      const current = await receiptRepository.findById(id, tx);
      if (!current) throw notFound('الوصل');

      await receiptRepository.incrementReprint(id, tx);
      await writeAudit(
        {
          userId: meta.user.userId,
          action: 'UPDATE',
          entityType: 'Receipt',
          entityId: id,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          before: { reprintCount: current.reprintCount },
          after: { reprintCount: current.reprintCount + 1 },
          metadata: { operation: 'reprint', receiptNo: current.receiptNo },
        },
        tx,
      );

      const after = await receiptRepository.findById(id, tx);
      if (!after) throw notFound('الوصل');
      return toReceiptViewDto(after, true);
    });
  },
};
