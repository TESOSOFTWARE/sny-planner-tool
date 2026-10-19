/** Number display shared by Materials tabs. Blank source values stay blank. */
export function formatMaterialNumber(value: string | number | null | undefined, unit?: string) {
  if (value == null || String(value).trim() === '') return '—'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  const formatted = numeric.toLocaleString('vi-VN', { maximumFractionDigits: 20 })
  return unit ? `${formatted} ${unit}` : formatted
}
