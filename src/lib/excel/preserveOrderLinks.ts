import { Prisma } from '@prisma/client'

type OutputRow = {
  machineId: string
  reportDate: Date | string
  shift: string
  color: string
  orderRef: string | null
  orderId?: string | null
  denier?: unknown
  width?: unknown
  weavingMachineRef?: string | null
  weightSpec?: unknown
  beamNote?: string | null
  strand?: unknown
  beamCount1?: unknown
  mPerEa?: unknown
  weigValue?: unknown
  beamCount2?: unknown
  weightKgs?: unknown
  quantity?: unknown
  lengthM?: unknown
  tapeRoll?: unknown
  mValue?: unknown
  avgPerRoll?: unknown
  machineNote?: string | null
  machineSizeM?: unknown
  cmPerMin?: unknown
  meterPerDay?: unknown
  operatingGrade?: string | null
  totalPct?: unknown
}

export class OutputLinkConflict extends Error {}

// Fields that identify a physical/report line. Measurements and machine-level
// operating values are intentionally excluded so they may be corrected.
const stableFields: (keyof OutputRow)[] = [
  'machineId', 'reportDate', 'shift', 'color', 'orderRef', 'denier', 'width',
  'weavingMachineRef', 'weightSpec', 'beamNote', 'strand', 'beamCount1',
  'mPerEa', 'weigValue', 'beamCount2',
]

// Values that belong to an individual report line and can distinguish two
// lines in the same machine/day group. Machine-level values are intentionally
// excluded: the parser copies them onto every line in the block, so correcting
// one of them must not make every linked line look like a new identity.
const lineFields: (keyof OutputRow)[] = [
  'weightKgs', 'quantity', 'lengthM', 'tapeRoll', 'mValue', 'avgPerRoll',
]

// All numeric fields represented by OutputRow are persisted as Decimal(10, 2),
// except totalPct which is Decimal(5, 2). Keeping the same precision here is
// necessary because Prisma returns rounded Decimal values after an import.
const decimalFields = new Set<keyof OutputRow>([
  'denier', 'width', 'weightSpec', 'strand', 'beamCount1', 'mPerEa',
  'weigValue', 'beamCount2', 'weightKgs', 'quantity', 'lengthM', 'tapeRoll',
  'mValue', 'avgPerRoll', 'machineSizeM', 'cmPerMin', 'meterPerDay',
  'totalPct',
])

function normalizeDecimal(value: unknown): string {
  if (value == null || value === '') return ''

  // Prisma.Decimal handles numbers, decimal strings, exponent notation, and
  // values read directly from Prisma without inheriting JS floating-point
  // rounding (for example, 1.005 -> 1.01 at database precision).
  const raw = String(value).trim()
  try {
    return new Prisma.Decimal(raw).toDecimalPlaces(2).toFixed(2)
  } catch {
    // Incoming rows are validated as finite numbers. Keep malformed values
    // comparable instead of throwing from the identity-preservation helper.
    return raw.toUpperCase()
  }
}

function normalize(value: unknown, field?: keyof OutputRow): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (field && decimalFields.has(field)) return normalizeDecimal(value)
  return String(value).trim().toUpperCase()
}

function makeKey(row: OutputRow, fields: (keyof OutputRow)[]): string {
  return JSON.stringify(fields.map(field => field === 'reportDate'
    ? new Date(row[field] as Date | string).toISOString()
    : normalize(row[field], field)))
}

function stableKey(row: OutputRow): string {
  return makeKey(row, stableFields)
}

function exactKey(row: OutputRow): string {
  return JSON.stringify([stableKey(row), makeKey(row, lineFields)])
}

function conflict(message: string): never {
  throw new OutputLinkConflict(message)
}

/**
 * Retain manual output-to-order links while replacing an imported report.
 * Matching is independent of file row order. Ambiguous multi-line groups are
 * rejected before the caller deletes any records.
 */
export function preserveOrderLinks<T extends OutputRow>(
  incoming: T[],
  existing: OutputRow[],
  orders: { id: string; piNumber: string }[],
): (T & { orderId: string | null })[] {
  const existingByStable = new Map<string, OutputRow[]>()
  const incomingByStable = new Map<string, T[]>()
  for (const row of existing) {
    const key = stableKey(row)
    existingByStable.set(key, [...(existingByStable.get(key) ?? []), row])
  }
  for (const row of incoming) {
    const key = stableKey(row)
    incomingByStable.set(key, [...(incomingByStable.get(key) ?? []), row])
  }

  const assigned = new Map<T, string>()

  for (const [key, oldGroup] of Array.from(existingByStable.entries())) {
    const newGroup = incomingByStable.get(key) ?? []
    const linkedOld = oldGroup.filter(row => row.orderId)
    if (linkedOld.length === 0) continue
    if (newGroup.length === 0 || newGroup.length < linkedOld.length) {
      conflict('Báo cáo đã bỏ dòng đang liên kết đơn. Hãy xử lý liên kết trước khi import lại.')
    }

    const oldByExact = new Map<string, OutputRow[]>()
    const newByExact = new Map<string, T[]>()
    for (const row of oldGroup) {
      const exact = exactKey(row)
      oldByExact.set(exact, [...(oldByExact.get(exact) ?? []), row])
    }
    for (const row of newGroup) {
      const exact = exactKey(row)
      newByExact.set(exact, [...(newByExact.get(exact) ?? []), row])
    }

    for (const [exact, oldExactGroup] of Array.from(oldByExact.entries())) {
      const linkedExact = oldExactGroup.filter(row => row.orderId)
      if (linkedExact.length === 0) continue
      const newExactGroup = newByExact.get(exact) ?? []
      if (newExactGroup.length !== oldExactGroup.length) {
        if (oldGroup.length !== 1 || newGroup.length !== 1) {
          conflict('Không thể xác định dòng đã liên kết sau khi import. Hãy giữ đủ thông tin nhận diện dòng.')
        }
        continue
      }
      if (linkedExact.length !== oldExactGroup.length) {
        conflict('Có các dòng trùng hoàn toàn nhưng trạng thái liên kết khác nhau. Cần xác định dòng trước khi import lại.')
      }
      const linkedIds = new Set(linkedExact.map(row => row.orderId!))
      if (linkedIds.size > 1) {
        conflict('Có nhiều dòng trùng khóa nhưng liên kết đơn khác nhau. Cần xác định dòng trước khi import lại.')
      }
      for (const row of newExactGroup) assigned.set(row, linkedExact[0].orderId!)
    }

    // A single-line group can safely fall back when measurements changed.
    if (oldGroup.length === 1 && newGroup.length === 1 && linkedOld.length === 1) {
      assigned.set(newGroup[0], linkedOld[0].orderId!)
      continue
    }

    const matchedOldIds = new Set(Array.from(assigned.entries())
      .filter(([row]) => newGroup.includes(row))
      .map(([, id]) => id))
    const linkedOldIds = new Set(linkedOld.map(row => row.orderId!))
    if (matchedOldIds.size < linkedOldIds.size || linkedOld.some(row => {
      const exactMatches = newByExact.get(exactKey(row)) ?? []
      return exactMatches.length === 0 && oldGroup.length > 1
    })) {
      conflict('Không thể ghép duy nhất các dòng đã liên kết. Hãy bổ sung thông tin phân biệt rồi import lại.')
    }
  }

  const byPi = new Map<string, string | null>()
  for (const order of orders) {
    const key = normalize(order.piNumber)
    byPi.set(key, byPi.has(key) ? null : order.id)
  }

  return incoming.map(row => {
    const linkedId = assigned.get(row)
    if (linkedId) return { ...row, orderId: linkedId }
    const piId = row.orderRef ? byPi.get(normalize(row.orderRef)) ?? null : null
    return { ...row, orderId: piId }
  })
}
