export interface RollingPeriod { month: number; year: number }

export function validateRollingPeriod(month: unknown, year: unknown): RollingPeriod | null {
  const m = typeof month === 'number' ? month : typeof month === 'string' && /^\d{1,2}$/.test(month) ? Number(month) : NaN
  const y = typeof year === 'number' ? year : typeof year === 'string' && /^\d{4}$/.test(year) ? Number(year) : NaN
  return Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(y) && y >= 1900 && y <= 9999 ? { month: m, year: y } : null
}

export function rollingPeriodFromFileName(fileName: string): RollingPeriod | null {
  const match = fileName.match(/(?:^|[^\d])(\d{2})[-_](\d{4})(?!\d)/)
  return match ? validateRollingPeriod(match[1], match[2]) : null
}
