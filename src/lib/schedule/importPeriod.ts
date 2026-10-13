export interface SchedulePeriod {
  year: number
  month: number
}

export interface SchedulePeriodConfirmation {
  sheetName: string
  sheetTitle: string
  importPeriod: SchedulePeriod
  titlePeriod: SchedulePeriod
}

/** Recognize explicit monthly title formats; leave unknown titles unclassified. */
export function parseScheduleTitlePeriod(title: string): SchedulePeriod | null {
  const match = title.trim().match(/\b(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\s*[-–—/]?\s*(\d{4})\b/i)
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  if (match) return { year: Number(match[2]), month: months.indexOf(match[1].slice(0, 3).toUpperCase()) + 1 }
  const numeric = title.trim().match(/^(\d{1,2})[/-](\d{4})$/)
  if (!numeric || Number(numeric[1]) < 1 || Number(numeric[1]) > 12) return null
  return { year: Number(numeric[2]), month: Number(numeric[1]) }
}

export function schedulePeriodKey(period: SchedulePeriod): string {
  return String(period.year) + '-' + String(period.month).padStart(2, '0')
}

export function getSchedulePeriodConfirmation(source: {
  sheetName: string
  sheetTitle: string
  year: number
  month: number
  titlePeriod: SchedulePeriod | null
}): SchedulePeriodConfirmation | null {
  if (!source.titlePeriod || (source.titlePeriod.year === source.year && source.titlePeriod.month === source.month)) return null
  return {
    sheetName: source.sheetName,
    sheetTitle: source.sheetTitle,
    importPeriod: { year: source.year, month: source.month },
    titlePeriod: source.titlePeriod,
  }
}
