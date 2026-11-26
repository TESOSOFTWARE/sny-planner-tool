import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { StatisticalReportSheet } from './importReview'
import { productionPiResolver } from '@/lib/excel/productionPi'

export type ReportSheetStage = 'EXTRUDER' | 'WARPING' | 'KNITTING' | 'ROLLING'

/** Source row IDs are stable within a monthly report; a metric distinguishes Rolling's long rows. */
export function productionReportSourceKey(stage: ReportSheetStage, reportMonth: string, sourceRow: number | undefined, metricLabel?: string) {
  if (!sourceRow || !Number.isInteger(sourceRow) || sourceRow < 1 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(reportMonth)) return null
  const identity = [stage, reportMonth, sourceRow, metricLabel?.trim().toUpperCase() ?? ''].join('|')
  return createHash('sha256').update(identity).digest('hex')
}

export function productionReportMonthRange(reportMonth: string) {
  const match = reportMonth.match(/^(\d{4})-(\d{2})$/)
  if (!match) throw new Error('Kỳ báo cáo không hợp lệ.')
  const year = Number(match[1]), month = Number(match[2])
  if (month < 1 || month > 12) throw new Error('Kỳ báo cáo không hợp lệ.')
  return { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) }
}

export type DiffInput = { sourceKey: string | null; data: Record<string, unknown> }
export type ExistingDiffRow = { id: string; sourceKey: string | null; dataSource?: string; [key: string]: unknown }
export type ReportRowDiff = {
  creates: DiffInput[]
  updates: Array<{ id: string; sourceKey: string; data: Record<string, unknown> }>
  adoptions: Array<{ id: string; sourceKey: string }>
  unchanged: number
  missingInSource: number
  ambiguous: number
}

export type LinkableReportRow = { sourceKey: string | null; orderRef: string | null; sourceOrderRefs?: string[]; orderId?: string | null }
export function linkReportRowsBySourceKey<T extends LinkableReportRow>(
  rows: T[],
  existing: Array<{ sourceKey: string | null; orderRef: string | null; orderId: string | null }>,
  orders: Array<{ id: string; piNumber: string }>,
): { rows: Array<T & { orderId: string | null }>; ambiguousRows: T[] } {
  const resolvePi = productionPiResolver(orders.map(order => order.piNumber))
  const orderByPi = new Map<string, string | null>()
  for (const order of orders) {
    const key = order.piNumber.trim().replace(/\s+/g, ' ').toUpperCase()
    orderByPi.set(key, orderByPi.has(key) ? null : order.id)
  }
  const existingBySourceKey = new Map(existing.filter(row => row.sourceKey).map(row => [row.sourceKey!, row]))
  const ambiguousRows: T[] = []
  const linked: Array<T & { orderId: string | null }> = []
  for (const row of rows) {
    const refs = Array.from(new Set([row.orderRef, ...(row.sourceOrderRefs ?? [])].filter((value): value is string => Boolean(value?.trim()))))
    const knownPis = Array.from(new Set(refs.map(resolvePi).filter((pi): pi is string => pi !== null)))
    if (knownPis.length > 1) { ambiguousRows.push(row); continue }
    const resolvedPi = knownPis[0] ?? (row.orderRef ? resolvePi(row.orderRef) : null)
    const rawRef = resolvedPi ? refs.find(ref => resolvePi(ref) === resolvedPi) ?? row.orderRef : row.orderRef
    const existingRow = row.sourceKey ? existingBySourceKey.get(row.sourceKey) : undefined
    const oldPi = existingRow?.orderRef ? resolvePi(existingRow.orderRef) ?? existingRow.orderRef.trim().replace(/\s+/g, ' ').toUpperCase() : null
    const newPi = resolvedPi ?? (rawRef ? rawRef.trim().replace(/\s+/g, ' ').toUpperCase() : null)
    const orderId = existingRow?.orderId && oldPi && oldPi === newPi
      ? existingRow.orderId
      : resolvedPi ? orderByPi.get(resolvedPi) ?? null : null
    linked.push({ ...row, ...(rawRef ? { orderRef: rawRef } : {}), orderId })
  }
  return { rows: linked, ambiguousRows }
}

export async function priorConfirmedReportRows(
  tx: Prisma.TransactionClient,
  currentBatchId: string | undefined,
  sheetName: StatisticalReportSheet,
): Promise<{ reportMonth: string; rows: unknown[]; decisions: unknown } | null> {
  if (!currentBatchId) return null
  const current = await tx.productionReportImportBatch.findUnique({ where: { id: currentBatchId }, select: { reportMonth: true } })
  if (!current) return null
  const prior = await tx.productionReportImportBatch.findFirst({
    where: { reportMonth: current.reportMonth, id: { not: currentBatchId }, status: { in: ['CONFIRMED', 'PARTIAL'] }, sheets: { some: { sheetName, status: 'CONFIRMED' } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { sheets: { where: { sheetName, status: 'CONFIRMED' }, select: { sourceRows: true }, take: 1 } },
  })
  const sourceRows = prior?.sheets[0]?.sourceRows
  return Array.isArray(sourceRows) ? { reportMonth: current.reportMonth, rows: sourceRows, decisions: prior?.decisions ?? {} } : null
}

function normalized(value: unknown): unknown {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toFixed(2)) : String(value)
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return value.map(normalized)
  if (typeof value === 'object') {
    const decimal = value as { toNumber?: () => number; toString?: () => string }
    if (typeof decimal.toNumber === 'function') {
      const number = decimal.toNumber()
      return Number.isFinite(number) ? Number(number.toFixed(2)) : decimal.toString?.() ?? null
    }
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalized(item)]))
  }
  return value
}

export function productionReportIdentityKey(values: unknown[]) {
  return JSON.stringify(values.map(normalized))
}

function businessPayload(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['id', 'sourceKey', 'dataSource', 'createdAt', 'updatedAt', 'orderId'].includes(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, normalized(item)]))
}

/** Build a one-to-one sourceKey adoption plan from a prior snapshot for legacy rows. */
export function legacySourceKeyAdoptions<T extends ExistingDiffRow>(existing: T[], priorRows: DiffInput[]) {
  const legacyByPayload = new Map<string, T[]>()
  const priorByPayload = new Map<string, DiffInput[]>()
  for (const row of existing) {
    if (row.sourceKey || row.dataSource === 'manual') continue
    const key = payloadKey(row)
    legacyByPayload.set(key, [...(legacyByPayload.get(key) ?? []), row])
  }
  for (const row of priorRows) {
    if (!row.sourceKey) continue
    const key = payloadKey(row.data)
    priorByPayload.set(key, [...(priorByPayload.get(key) ?? []), row])
  }
  const adoptions: Array<{ id: string; sourceKey: string }> = []
  for (const [key, legacyRows] of Array.from(legacyByPayload.entries())) {
    const prior = priorByPayload.get(key) ?? []
    if (legacyRows.length === 1 && prior.length === 1) adoptions.push({ id: legacyRows[0].id, sourceKey: prior[0].sourceKey! })
  }
  return adoptions
}

function payloadKey(value: Record<string, unknown>) {
  return JSON.stringify(businessPayload(value))
}

/**
 * Compares only importer-owned, valid rows. Identical legacy rows can adopt a
 * source key once; ambiguous legacy matches are left untouched and counted.
 * Missing source rows are reported but never deleted.
 */
export function diffProductionReportRows(
  incoming: DiffInput[],
  existing: ExistingDiffRow[],
  options: {
    identityKey?: (row: Record<string, unknown>) => string
    legacyCandidateKey?: (row: Record<string, unknown>) => string
    protectedSourceKeys?: ReadonlySet<string>
    countsScope?: (row: ExistingDiffRow) => boolean
  } = {},
): ReportRowDiff {
  const matchedExisting = new Set<string>()
  const creates: DiffInput[] = []
  const updates: ReportRowDiff['updates'] = []
  const adoptions: ReportRowDiff['adoptions'] = []
  let unchanged = 0
  let ambiguous = 0

  const existingBySourceKey = new Map<string, ExistingDiffRow>()
  const duplicateSourceKeys = new Set<string>()
  for (const row of existing) {
    if (!row.sourceKey) continue
    if (existingBySourceKey.has(row.sourceKey)) duplicateSourceKeys.add(row.sourceKey)
    else existingBySourceKey.set(row.sourceKey, row)
  }

  const incomingKeyCounts = new Map<string, number>()
  for (const row of incoming) if (row.sourceKey) incomingKeyCounts.set(row.sourceKey, (incomingKeyCounts.get(row.sourceKey) ?? 0) + 1)
  const exactMatched = new Set<number>()

  // First match unchanged rows independent of their current Excel row number.
  for (let index = 0; index < incoming.length; index++) {
    const row = incoming[index]
    if (!row.sourceKey || incomingKeyCounts.get(row.sourceKey) !== 1 || duplicateSourceKeys.has(row.sourceKey)) continue
    const exact = existing.find(candidate => candidate.dataSource !== 'manual' && !matchedExisting.has(candidate.id) && payloadKey(row.data) === payloadKey(candidate))
    if (!exact) continue
    matchedExisting.add(exact.id)
    exactMatched.add(index)
    unchanged++
    if (!exact.sourceKey) adoptions.push({ id: exact.id, sourceKey: row.sourceKey })
  }

  const seenIncomingKeys = new Set<string>()
  for (let index = 0; index < incoming.length; index++) {
    if (exactMatched.has(index)) continue
    const row = incoming[index]
    if (!row.sourceKey || incomingKeyCounts.get(row.sourceKey) !== 1 || seenIncomingKeys.has(row.sourceKey) || duplicateSourceKeys.has(row.sourceKey)) {
      ambiguous++
      continue
    }
    seenIncomingKeys.add(row.sourceKey)
    const keyOwner = existingBySourceKey.get(row.sourceKey)

    if (keyOwner && !matchedExisting.has(keyOwner.id) && (!options.identityKey || options.identityKey(row.data) === options.identityKey(keyOwner))) {
      matchedExisting.add(keyOwner.id)
      if (payloadKey(row.data) === payloadKey(keyOwner)) unchanged++
      else updates.push({ id: keyOwner.id, sourceKey: keyOwner.sourceKey ?? row.sourceKey, data: row.data })
      continue
    }

    if (options.identityKey) {
      const identityKey = options.identityKey
      const incomingIdentity = identityKey(row.data)
      const candidates = existing.filter(candidate => candidate.dataSource !== 'manual' && !matchedExisting.has(candidate.id) && identityKey(candidate) === incomingIdentity)
      if (candidates.length === 1) {
        const match = candidates[0]
        if (keyOwner && matchedExisting.has(keyOwner.id) && keyOwner.id !== match.id && !match.sourceKey) {
          ambiguous++
          continue
        }
        matchedExisting.add(match.id)
        if (payloadKey(row.data) === payloadKey(match)) unchanged++
        else updates.push({ id: match.id, sourceKey: match.sourceKey ?? row.sourceKey, data: row.data })
        continue
      }
      if (candidates.length > 1) {
        ambiguous++
        continue
      }
    }

    if (keyOwner && matchedExisting.has(keyOwner.id)) {
      ambiguous++
      continue
    }

    if (options.legacyCandidateKey) {
      const legacyCandidateKey = options.legacyCandidateKey
      const incomingScope = legacyCandidateKey(row.data)
      const possibleLegacy = existing.some(candidate => !candidate.sourceKey && candidate.dataSource !== 'manual' && !matchedExisting.has(candidate.id) && legacyCandidateKey(candidate) === incomingScope)
      if (possibleLegacy) {
        ambiguous++
        continue
      }
    }
    creates.push(row)
  }

  return {
    creates,
    updates,
    adoptions,
    unchanged,
    missingInSource: existing.filter(row => row.sourceKey && !matchedExisting.has(row.id) && !options.protectedSourceKeys?.has(row.sourceKey) && (!options.countsScope || options.countsScope(row))).length,
    ambiguous,
  }
}
