// src/lib/customers/matching.ts
// Standardized Customer Matching Module for SNY Planner.
// Ensures accurate customer reconciliation without arbitrary findFirst picks.

export type CustomerMatchStatus = 'MATCHED' | 'NEEDS_REVIEW' | 'AMBIGUOUS' | 'UNMATCHED'

export interface CustomerCandidate {
  id: string
  name: string
}

export interface CustomerMatchResult {
  status: CustomerMatchStatus
  customer: CustomerCandidate | null
  /** Gợi ý gộp khi status là NEEDS_REVIEW (khớp sau khi xóa hậu tố pháp nhân). */
  suggested?: CustomerCandidate | null
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
 * Finds an exact or safe alias match for a customer from a candidate list.
 * Rules:
 * 1. Exactly 1 normalized match (trim + collapse whitespace + case-insensitive) -> MATCHED.
 * 2. Exactly 1 match only after stripping corporate suffixes (Co., Ltd, Corp, Inc...)
 *    -> NEEDS_REVIEW with `suggested` set. The caller must ask a human to merge
 *    or create new; the engine never auto-merges on suffix-stripped names.
 * 3. 2 or more matches at any tier -> AMBIGUOUS (returns null customer, raises warning).
 * 4. 0 matches -> UNMATCHED (caller may create a new customer if row is valid).
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

  // 2. Cleaned core name match (strips Co., Ltd, Corp, Inc).
  // Suffix-stripped matches are NEVER auto-merged: they need human review
  // (e.g. "LOW" vs "LOWS" or two distinct companies sharing a core name).
  const cleanQuery = cleanCustomerName(queryName)
  if (cleanQuery) {
    const cleanMatches = existingCustomers.filter(
      (c) => cleanCustomerName(c.name) === cleanQuery
    )

    if (cleanMatches.length === 1) {
      return {
        status: 'NEEDS_REVIEW',
        customer: null,
        suggested: cleanMatches[0],
        reason: `Tên "${queryName}" gần giống khách hiện có "${cleanMatches[0].name}" (khác hậu tố pháp nhân) — cần planner xác nhận gộp hay tạo mới`,
      }
    }
    if (cleanMatches.length > 1) {
      return {
        status: 'AMBIGUOUS',
        customer: null,
        reason: `Tên khách hàng "${queryName}" khớp với nhiều bản ghi khách hàng sau khi chuẩn hóa: ${cleanMatches.map((c) => c.name).join(', ')}`,
      }
    }
  }

  return { status: 'UNMATCHED', customer: null }
}

// ── P0-12: planner override resolution (shared by bulk + import confirm) ──
// Pure helper: same rule as import/confirm — override MERGE:<id> wins,
// NEEDS_REVIEW without explicit decision becomes a conflict, AMBIGUOUS
// never auto-picks. Returns planner-facing review lists so the UI can
// show radios BEFORE anything is written.

export interface CustomerOverrideInput {
  rowName: string
  /** `MERGE:<customerId>` reuses an existing customer; 'NEW' forces creation. */
  decision: string
}

export interface CustomerReviewItem {
  name: string
  suggestedId: string
  suggestedName: string
  reason: string
}

export interface CustomerAmbiguousItem {
  name: string
  reason: string
}

export interface CustomerResolutionResult {
  /** name -> customerId, ready to link */
  resolved: Map<string, string>
  /** name -> reason, rows using these names must be blocked */
  ambiguous: Map<string, string>
  /** NEEDS_REVIEW without override — UI must ask */
  reviews: CustomerReviewItem[]
  /** AMBIGUOUS without override — UI shows as unresolvable here */
  blockedAmbiguous: CustomerAmbiguousItem[]
}

export function resolveCustomerNames(
  names: string[],
  existingCustomers: CustomerCandidate[],
  overrides: CustomerOverrideInput[],
): CustomerResolutionResult {
  const resolved = new Map<string, string>()
  const ambiguous = new Map<string, string>()
  const reviews: CustomerReviewItem[] = []
  const blockedAmbiguous: CustomerAmbiguousItem[] = []
  const customerIdSet = new Set(existingCustomers.map((c) => c.id))
  const overrideByName = new Map<string, string>()
  for (const o of overrides) {
    overrideByName.set(String(o.rowName ?? '').trim(), String(o.decision ?? ''))
  }

  for (const name of Array.from(new Set(names))) {
    const override = overrideByName.get(name)
    if (override && override !== 'NEW') {
      const mergeId = override.slice('MERGE:'.length)
      if (customerIdSet.has(mergeId)) {
        resolved.set(name, mergeId)
      } else {
        ambiguous.set(
          name,
          `Lựa chọn gộp khách hàng "${name}" trỏ tới bản ghi không tồn tại — vui lòng xem trước lại.`,
        )
      }
      continue
    }
    const match = findCustomerMatch(name, existingCustomers)
    if (match.status === 'MATCHED' && match.customer) {
      resolved.set(name, match.customer.id)
    } else if (match.status === 'AMBIGUOUS') {
      const reason = match.reason || 'Có nhiều khách hàng trùng tên sau khi chuẩn hóa; không tự chọn bản ghi'
      ambiguous.set(name, reason)
      blockedAmbiguous.push({ name, reason })
    } else if (match.status === 'NEEDS_REVIEW' && override !== 'NEW') {
      const reason = match.reason || `Tên "${name}" cần planner xác nhận gộp hay tạo mới`
      ambiguous.set(name, reason)
      if (match.suggested) {
        reviews.push({ name, suggestedId: match.suggested.id, suggestedName: match.suggested.name, reason })
      }
    }
    // UNMATCHED and explicit NEW fall through: caller creates the customer.
  }

  return { resolved, ambiguous, reviews, blockedAmbiguous }
}
