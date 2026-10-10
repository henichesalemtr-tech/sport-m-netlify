/**
 * قراءة ملفات الاستيراد (xlsx/csv) — exceljs يُستورد ديناميكيًا.
 * دوال parsing نقية (بدون DB) وقابلة للاختبار.
 */

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
}

/** إزالة BOM من بداية النص. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * محلل CSV بسيط يدعم الاقتباس المزدوج ("...") والفواصل داخل الاقتباس
 * و"" كهروب لعلامة اقتباس. دالة نقية.
 */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = stripBom(text);

  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** تحويل قيمة خلية exceljs إلى نص (دالة نقية). */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    // خلية غنية (rich text) أو رابط أو نتيجة معادلة
    if (typeof rec.text === 'string') return rec.text;
    if (typeof rec.result === 'string') return rec.result;
    if (typeof rec.result === 'number') return String(rec.result);
    if (rec.hyperlink !== undefined && typeof rec.text === 'string') return rec.text;
    return '';
  }
  if (typeof value === 'number') {
    // تجنب الترميز العلمي للأرقام الكبيرة (مثل أرقام الهاتف)
    return Number.isInteger(value) ? value.toString() : String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

type ExcelJsModule = typeof import('exceljs');

async function loadExcelJs(): Promise<ExcelJsModule> {
  const mod = (await import('exceljs')) as ExcelJsModule & { default?: ExcelJsModule };
  return mod.default ?? mod;
}

/** قراءة xlsx عبر exceljs (استيراد ديناميكي). */
export async function parseXlsx(buffer: Buffer): Promise<ParsedSheet> {
  const excel = await loadExcelJs();
  const workbook = new excel.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const all: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    const count = row.cellCount;
    for (let c = 1; c <= count; c++) {
      values.push(cellToString(row.getCell(c).value));
    }
    all.push(values);
  });
  if (all.length === 0) return { headers: [], rows: [] };
  const headers = (all[0] ?? []).map((h) => h.trim());
  return { headers, rows: all.slice(1) };
}

/** قراءة ملف استيراد حسب الامتداد. */
export async function parseImportFile(buffer: Buffer, fileName: string): Promise<ParsedSheet> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx')) return parseXlsx(buffer);
  if (lower.endsWith('.csv')) {
    const all = parseCsvText(buffer.toString('utf8'));
    if (all.length === 0) return { headers: [], rows: [] };
    const headers = (all[0] ?? []).map((h) => h.trim());
    return { headers, rows: all.slice(1) };
  }
  return { headers: [], rows: [] };
}

/**
 * اقتراح ربط الأعمدة تلقائيًا: مطابقة ترويسة الملف مع أسماء/تسميات الحقول
 * (بلا حساسية لحالة الأحرف والمسافات). دالة نقية.
 */
export function suggestMapping(
  headers: string[],
  fields: Array<{ name: string; label: string; aliases?: string[] }>,
): Record<string, number> {
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, ''));
  const mapping: Record<string, number> = {};
  for (const f of fields) {
    const candidates = [f.name.toLowerCase(), f.label.toLowerCase().replace(/\s+/g, ''), ...(f.aliases ?? []).map((a) => a.toLowerCase())];
    const idx = normalized.findIndex((h) => candidates.includes(h));
    if (idx >= 0) mapping[f.name] = idx;
  }
  return mapping;
}
