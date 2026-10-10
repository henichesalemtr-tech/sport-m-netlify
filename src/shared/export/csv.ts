/**
 * تصدير CSV (7.14 / 9.3):
 * - تعقيم حقن الصيغ (CSV Injection): أي خلية تبدأ بـ = + - @ تُباد بـ 'SingleQuote.
 * - ترميز UTF-8 مع BOM حتى يظهر العربية صحيحًا في Excel.
 * - دعم التدفق (Streaming) للصادرات الكبيرة عبر ReadableStream.
 */

export type CellValue = string | number | boolean | bigint | Date | null | undefined;

export interface ExportColumn {
  /** مفتاح الحقل في الصفوف. */
  key: string;
  /** ترويسة عربية للعرض. */
  label: string;
}

/** بادئات الحقن المعروفة (CSV Injection). */
const INJECTION_PREFIXES = ['=', '+', '-', '@'] as const;

/** بادئة BOM لترميز UTF-8 (يلزم Excel لقراءة العربية). */
export const CSV_BOM = '\uFEFF';

/**
 * تعقيم قيمة خلية: دالة نقية.
 * - القيم الخالية → نص فارغ.
 * - الخلية التي تبدأ بأحد محارف الصيغ تُسبق بـ ' لتحييدها.
 * - تُزال المحارف الاتجاهية غير المرئية (RTL/LTR overrides) لمنع خداع العرض.
 */
export function sanitizeCsvCell(value: CellValue): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (value instanceof Date) {
    text = value.toISOString();
  } else if (typeof value === 'bigint') {
    text = value.toString();
  } else {
    text = String(value);
  }
  // إزالة محارف التحكم الاتجاهية غير المرئية
  text = text.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '');
  if (INJECTION_PREFIXES.some((p) => text.startsWith(p))) {
    text = `'${text}`;
  }
  return text;
}

/** اقتباس حقل CSV عند الحاجة (فاصلة/اقتباس/سطر جديد). */
export function escapeCsvField(text: string): string {
  if (/["\n\r,]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** بناء سطر CSV من قيم (تعقيم + اقتباس). */
export function toCsvLine(cells: CellValue[]): string {
  return cells.map((c) => escapeCsvField(sanitizeCsvCell(c))).join(',');
}

/** تحويل صف (كائن) إلى سطر CSV حسب ترتيب الأعمدة. */
export function rowToCsvLine(row: Record<string, CellValue>, columns: ExportColumn[]): string {
  return toCsvLine(columns.map((c) => row[c.key]));
}

/** بناء ملف CSV كامل كنص (مع BOM والترويسة). */
export function buildCsv(columns: ExportColumn[], rows: Record<string, CellValue>[]): string {
  const lines = [toCsvLine(columns.map((c) => c.label))];
  for (const row of rows) lines.push(rowToCsvLine(row, columns));
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

/** اسم ملف آمن للتنزيل (Content-Disposition). */
export function contentDisposition(fileName: string, inline = false): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
  const encoded = encodeURIComponent(fileName);
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export interface StreamCsvOptions {
  /** حجم الدفعة الواحدة للقراءة من المصدر. */
  batchSize?: number;
}

/**
 * بث CSV للصادرات الكبيرة: يجلب الصفوف دفعاتٍ دفعات عبر `fetchBatch`
 * (fetchBatch(offset, limit) → صفوف؛ مصفوفة فارغة تعني النهاية).
 */
export function streamCsv(
  columns: ExportColumn[],
  fetchBatch: (offset: number, limit: number) => Promise<Record<string, CellValue>[]>,
  opts: StreamCsvOptions = {},
): ReadableStream<Uint8Array> {
  const batchSize = opts.batchSize ?? 1000;
  const encoder = new TextEncoder();
  let offset = 0;
  let headerSent = false;
  let done = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!headerSent) {
          controller.enqueue(encoder.encode(CSV_BOM + toCsvLine(columns.map((c) => c.label)) + '\r\n'));
          headerSent = true;
          return;
        }
        if (done) {
          controller.close();
          return;
        }
        const batch = await fetchBatch(offset, batchSize);
        if (batch.length === 0) {
          done = true;
          controller.close();
          return;
        }
        offset += batch.length;
        const chunk = batch.map((row) => rowToCsvLine(row, columns) + '\r\n').join('');
        controller.enqueue(encoder.encode(chunk));
        if (batch.length < batchSize) {
          done = true;
        }
      } catch (e) {
        controller.error(e);
      }
    },
  });
}
