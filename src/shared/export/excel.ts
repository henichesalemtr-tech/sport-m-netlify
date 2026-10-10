/**
 * تصدير Excel (exceljs) — 7.14:
 * - ورقة RTL (rightToLeft) لأن الواجهة عربية.
 * - نفس تعقيم حقن الصيغ المطبَّق في CSV (نص يبدأ بـ = + - @ يُحوَّل لنص آمن).
 * - BigInt يُكتب كنص (تجنب فقدان الدقة)، والتواريخ كتواريخ Excel.
 * - exceljs يُستورد ديناميكيًا حتى لا يدخل في حزمة المتصفح.
 */
import { sanitizeCsvCell, type CellValue, type ExportColumn } from './csv';

type ExcelJsModule = typeof import('exceljs');

async function loadExcelJs(): Promise<ExcelJsModule> {
  const mod = (await import('exceljs')) as ExcelJsModule & { default?: ExcelJsModule };
  return mod.default ?? mod;
}

/** تحويل قيمة إلى ما يقبله exceljs (دالة نقية). */
export function toExcelCell(value: CellValue): string | number | boolean | Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'bigint') return sanitizeCsvCell(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = sanitizeCsvCell(value);
  // إذا بدأت الخلية بمحرف صيغة، نكتبها كنص صريح (exceljs يعتبر '=...' معادلة)
  return text;
}

export interface BuildXlsxOptions {
  /** اتجاه الورقة (افتراضيًا RTL). */
  rtl?: boolean;
  /** تجميد صف الترويسة. */
  freezeHeader?: boolean;
}

/** بناء مصنف Excel كامل في الذاكرة (مناسب للصادرات المتوسطة). */
export async function buildXlsx(
  sheetName: string,
  columns: ExportColumn[],
  rows: Record<string, CellValue>[],
  opts: BuildXlsxOptions = {},
): Promise<Buffer> {
  const excel = await loadExcelJs();
  const workbook = new excel.Workbook();
  workbook.creator = 'Sports Management System';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31) || 'Sheet1', {
    views: [{ rightToLeft: opts.rtl !== false, state: 'frozen', ySplit: opts.freezeHeader === false ? 0 : 1 }],
  });

  sheet.columns = columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: Math.max(12, Math.min(40, c.label.length + 6)),
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  for (const row of rows) {
    const values: Record<string, string | number | boolean | Date | null> = {};
    for (const c of columns) values[c.key] = toExcelCell(row[c.key]);
    sheet.addRow(values);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
