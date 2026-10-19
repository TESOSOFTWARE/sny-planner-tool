/** Shared with the browser upload filter. Keep each parser's existing matching rules. */
export type ReportSheetKind = 'EXTRUDER' | 'WARPING' | 'KNITTING' | 'HDPE' | 'MB' | 'KOREA' | 'ROLLING' | 'PACKING'

export function reportSheetMatches(name: string, kind: ReportSheetKind): boolean {
  if (kind === 'ROLLING') return name.toUpperCase().includes('ROLLING')
  if (kind === 'PACKING') {
    const upper = name.toUpperCase()
    return upper.includes('ĐÓNG GÓI') || upper.includes('PACKING')
  }
  if (kind === 'HDPE' || kind === 'MB' || kind === 'KOREA') {
    const normalized = name.trim().replace(/\s+/g, ' ').toUpperCase()
    return kind === 'MB' ? normalized === 'MB' || normalized === 'M/B' : normalized === kind
  }
  return name.trim().toUpperCase() === kind
}
