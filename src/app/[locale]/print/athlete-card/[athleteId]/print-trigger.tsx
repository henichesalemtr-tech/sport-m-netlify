'use client';

export function PrintTrigger({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print-hide rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
    >
      {label}
    </button>
  );
}
