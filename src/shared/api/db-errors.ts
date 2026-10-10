/**
 * أخطاء اتصال قاعدة البيانات العابرة.
 *
 * تجمّد الحوسبة في قواعد serverless (Neon) يترك اتصالات المجموعة ميتة، فتفشل أول موجة
 * استعلامات بعد الخمول قبل أن ينفّذ أي منها. هذا عابر ولا يعكس خللًا في الطلب، لذا يُردّ
 * 503 مع Retry-After بدل 500.
 */

export const DB_UNAVAILABLE_MESSAGE = 'تعذّر الاتصال بقاعدة البيانات مؤقتًا، أعد المحاولة';
const RETRY_AFTER_SECONDS = 2;

/** ثوانٍ إعادة المحاولة إذا كان الخطأ فشل إنشاء اتصال (لم ينفّذ الاستعلام)، وإلا null. */
export function transientDbRetryAfterSeconds(error: unknown): number | null {
  const e = error as { name?: unknown; code?: unknown } | null;
  if (!e || typeof e !== 'object') return null;
  if (e.name === 'PrismaClientInitializationError') return RETRY_AFTER_SECONDS;
  if (e.name === 'PrismaClientKnownRequestError' && (e.code === 'P1001' || e.code === 'P2024')) {
    return RETRY_AFTER_SECONDS;
  }
  return null;
}
