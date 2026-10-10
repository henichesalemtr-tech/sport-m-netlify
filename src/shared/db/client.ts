import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

interface TxOptions {
  timeout?: number;
  maxWait?: number;
}

// مهلة افتراضية أعلى للمعاملات التفاعلية: المعاملات المالية تنفّذ عشرات الاستعلامات
// المتسلسلة، وعلى قواعد مُدارة عالية الكمون (مثل Neon) تتجاوز مهلة Prisma الافتراضية
// (5 ثوانٍ) فتُفشل المعاملة. قواعد الاستضافة الذاتية السريعة لا تتأثر إطلاقًا.
const GLOBAL_TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;

type TransactionFn = (arg: unknown, options?: TxOptions) => Promise<unknown>;

const applyTxDelayDefaults = (client: PrismaClient): void => {
  const original = client.$transaction.bind(client) as unknown as TransactionFn;
  const patched: TransactionFn = (arg, options) =>
    typeof arg === 'function' ? original(arg, { ...GLOBAL_TX_OPTIONS, ...options }) : original(arg, options);
  client.$transaction = patched as unknown as PrismaClient['$transaction'];
};

const makeClient = () => {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['error'],
  });
  applyTxDelayDefaults(client);
  return client;
};

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export type PrismaTransaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
