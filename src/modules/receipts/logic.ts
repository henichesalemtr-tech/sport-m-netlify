/**
 * منطق أرقام الوصولات النقي (7.11) — تسلسلي بلا فجوات لكل سنة مالية.
 * قابل للاختبار دون قاعدة بيانات.
 */

/** الرقم التالي = أكبر رقم موجود + 1 (أو 1 عند عدم وجود أي وصل). */
export function nextReceiptSequence(existingSequences: readonly number[]): number {
  if (existingSequences.length === 0) return 1;
  return Math.max(...existingSequences) + 1;
}

/** صيغة رقم الوصل: REC-<السنة المالية>-<تسلسل 6 خانات>. */
export function formatReceiptNo(fiscalYear: number, sequence: number): string {
  return `REC-${fiscalYear}-${String(sequence).padStart(6, '0')}`;
}

/** الأرقام الناقصة ضمن المدى 1..max (كشف الفجوات — يجب أن تكون دائمًا []). */
export function findSequenceGaps(sequences: readonly number[]): number[] {
  if (sequences.length === 0) return [];
  const present = new Set(sequences);
  const max = Math.max(...sequences);
  const gaps: number[] = [];
  for (let i = 1; i <= max; i++) {
    if (!present.has(i)) gaps.push(i);
  }
  return gaps;
}

/** هل السلسلة بلا فجوات (1..n كاملة دون تكرار)؟ */
export function isGapless(sequences: readonly number[]): boolean {
  if (sequences.length === 0) return true;
  const unique = new Set(sequences);
  if (unique.size !== sequences.length) return false; // تكرار = انتهاك قيد
  return findSequenceGaps(sequences).length === 0;
}
