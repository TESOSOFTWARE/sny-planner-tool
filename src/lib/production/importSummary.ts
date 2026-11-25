export function publicImportSheetResults(value: unknown): Record<string, { status?: string; updatedAt?: string; result?: Record<string, unknown> }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, { status?: string; updatedAt?: string; result?: Record<string, unknown> }> = {}
  for (const [sheet, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const item = raw as Record<string, unknown>
    const publicResult: Record<string, unknown> = {}
    const allowedKeys = ['count', 'recordsInserted', 'recordsDeleted', 'datesScoped', 'created', 'materialsCreated', 'totalRows', ...(sheet === 'HDPE' ? [] : ['message'])]
    for (const key of allowedKeys) {
      const entry = item.result && typeof item.result === 'object' && !Array.isArray(item.result) ? (item.result as Record<string, unknown>)[key] : undefined
      if (typeof entry === 'string' || (typeof entry === 'number' && Number.isFinite(entry))) publicResult[key] = entry
    }
    const counts = item.result && typeof item.result === 'object' && !Array.isArray(item.result) ? (item.result as Record<string, unknown>).counts : undefined
    if (counts && typeof counts === 'object' && !Array.isArray(counts)) {
      publicResult.counts = Object.fromEntries(Object.entries(counts as Record<string, unknown>).filter(([, count]) => typeof count === 'number' && Number.isFinite(count)))
    }
    result[sheet] = {
      ...(typeof item.status === 'string' ? { status: item.status } : {}),
      ...(typeof item.updatedAt === 'string' ? { updatedAt: item.updatedAt } : {}),
      ...(Object.keys(publicResult).length ? { result: publicResult } : {}),
    }
  }
  return result
}

export function publicImportResult(result: unknown): Record<string, unknown> {
  return publicImportSheetResults({ sheet: { status: 'PUBLIC', result } }).sheet?.result ?? {}
}
