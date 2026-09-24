// src/lib/customers/matching.ts
// Standardized Customer Matching Module for SNY Planner.
// Ensures accurate customer reconciliation without arbitrary findFirst picks.

export type CustomerMatchStatus = 'MATCHED' | 'AMBIGUOUS' | 'UNMATCHED'

export interface CustomerCandidate {
  id: string
  name: string
}

export interface CustomerMatchResult {
  status: CustomerMatchStatus
  customer: CustomerCandidate | null
  reason?: string
}

/**
 * Normalizes a customer name:
 * - Trims leading and trailing whitespace
 * - Converts to lowercase
 * - Collapses multiple whitespace characters into a single space
 */
export function normalizeCustomerName(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * Cleans punctuation and common company suffixes for alias / core name matching.
 * E.g. "SEDCO CO., LTD." -> "sedco"
 */
export function cleanCustomerName(raw: string | null | undefined): string {
  const norm = normalizeCustomerName(raw)
  if (!norm) return ''
  return norm
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\b(co|ltd|inc|corp|company|limited|corporation|trading)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Standard known aliases for SNY legacy factory customers
 */
const KNOWN_ALIASES: Record<string, string> = {
  gromax: 'gromax',
  sedco: 'sedco',
  tarpswin: 'tarpswin',
  interway: 'interway',
}

/**
 * Finds an exact or safe alias match for a customer from a candidate list.
 * Rules:
 * 1. Exactly 1 match -> MATCHED.
 * 2. 2 or more matches -> AMBIGUOUS (returns null customer, raises warning; never arbitrarily picks one).
 * 3. 0 matches -> UNMATCHED (allows caller to create a new customer if row is valid).
 */
export function findCustomerMatch(
  queryName: string | null | undefined,
  existingCustomers: CustomerCandidate[]
): CustomerMatchResult {
  const normQuery = normalizeCustomerName(queryName)
  if (!normQuery) {
    return { status: 'UNMATCHED', customer: null, reason: 'Tên khách hàng trống' }
  }

  // 1. Exact normalized match
  const exactMatches = existingCustomers.filter(
    (c) => normalizeCustomerName(c.name) === normQuery
  )

  if (exactMatches.length === 1) {
    return { status: 'MATCHED', customer: exactMatches[0] }
  }
  if (exactMatches.length > 1) {
    return {
      status: 'AMBIGUOUS',
      customer: null,
      reason: `Có ${exactMatches.length} khách hàng trùng tên chính xác "${normQuery}" trong hệ thống`,
    }
  }

  // 2. Cleaned core name match (strips Co., Ltd, Corp, Inc)
  const cleanQuery = cleanCustomerName(queryName)
  if (cleanQuery) {
    const cleanMatches = existingCustomers.filter(
      (c) => cleanCustomerName(c.name) === cleanQuery
    )

    if (cleanMatches.length === 1) {
      return { status: 'MATCHED', customer: cleanMatches[0] }
    }
    if (cleanMatches.length > 1) {
      return {
        status: 'AMBIGUOUS',
        customer: null,
        reason: `Tên khách hàng "${queryName}" khớp với nhiều bản ghi khách hàng sau khi chuẩn hóa: ${cleanMatches.map((c) => c.name).join(', ')}`,
      }
    }

    // 3. Known alias dictionary check
    const aliasKey = KNOWN_ALIASES[cleanQuery]
    if (aliasKey) {
      const aliasMatches = existingCustomers.filter((c) => {
        const cClean = cleanCustomerName(c.name)
        return cClean === aliasKey || KNOWN_ALIASES[cClean] === aliasKey
      })

      if (aliasMatches.length === 1) {
        return { status: 'MATCHED', customer: aliasMatches[0] }
      }
      if (aliasMatches.length > 1) {
        return {
          status: 'AMBIGUOUS',
          customer: null,
          reason: `Khách hàng "${queryName}" trùng với nhiều khách hàng mang alias "${aliasKey}"`,
        }
      }
    }
  }

  return { status: 'UNMATCHED', customer: null }
}
