// MoM §2.4: ORDER LIST FR may be a fraction when no separate FR% column exists.
export interface OrderListFr {
  frFlag: boolean
  frPct: number | null
  error?: string
}

const ERROR = 'Giá trị % chống cháy (FR) không hợp lệ; phải là số từ 0 đến 100'
const TRUE_FLAGS = new Set(['true', 'yes', 'y', 'x', 'có'])
const FALSE_FLAGS = new Set(['false', 'no', 'n', 'không'])

function blank(value: unknown): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '')
}

function percentage(value: unknown, fractionAllowed: boolean): number | null {
  let number: number
  let percentSign = false
  if (typeof value === 'number') {
    number = value
  } else if (typeof value === 'string') {
    let text = value.trim()
    percentSign = text.endsWith('%')
    if (percentSign) text = text.slice(0, -1).trim()
    // Match the complete cell. Do not accept partial values such as "6.5abc".
    if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return null
    number = Number(text.replace(',', '.'))
  } else {
    return null
  }
  if (!Number.isFinite(number)) return null
  // Explicit FR% keeps invalid finite numbers visible for legacy row validation.
  if (number < 0 || number > 100) return number
  if (fractionAllowed && !percentSign && number > 0 && number <= 1) number *= 100
  return Math.round(number * 1e10) / 1e10
}

function explicitFlag(value: unknown): boolean {
  if (blank(value)) return false
  if (typeof value === 'boolean') return value
  const text = String(value).trim().toLowerCase()
  if (TRUE_FLAGS.has(text) || text === '1') return true
  const number = Number(value)
  return Number.isFinite(number) && number !== 0
}

export function parseOrderListFr(
  rawFr: unknown,
  rawFrPct: unknown,
  hasPercentageColumn: boolean,
  hasFlagColumn = true,
): OrderListFr {
  if (hasPercentageColumn) {
    const frPct = blank(rawFrPct) ? null : percentage(rawFrPct, false)
    const frFlag = hasFlagColumn ? explicitFlag(rawFr) : (frPct != null && frPct > 0)
    return {
      frFlag,
      frPct,
      ...(!blank(rawFrPct) && (frPct == null || frPct < 0 || frPct > 100) ? { error: ERROR } : {}),
    }
  }

  if (blank(rawFr)) return { frFlag: false, frPct: null }
  if (typeof rawFr === 'boolean') return { frFlag: rawFr, frPct: null }
  if (typeof rawFr === 'string') {
    const flag = rawFr.trim().toLowerCase()
    if (TRUE_FLAGS.has(flag)) return { frFlag: true, frPct: null }
    if (FALSE_FLAGS.has(flag)) return { frFlag: false, frPct: null }
  }
  const frPct = percentage(rawFr, true)
  if (frPct == null || frPct < 0 || frPct > 100) {
    return { frFlag: false, frPct: null, error: ERROR }
  }
  return { frFlag: frPct > 0, frPct }
}

