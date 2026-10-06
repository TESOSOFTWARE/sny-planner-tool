// src/lib/orders/recipeSnapshot.ts
// R6: freeze a color recipe into an order at approve time.
//
// The order stores only `color` (free text) + `colorVersion` ("Version A" /
// "Version B" / "STD"). The recipe catalog (ProductColorRecipe) holds the
// 7-component spec. At approve, we copy the CURRENT recipe into
// `ProductionOrder.colorRecipeSnapshot` (JSON string) so later recipe edits
// do not silently change already-approved orders.
//
// Rules:
// - Match by normalized (trim + UPPERCASE) color + version. Null/empty
//   version means "STD" on both sides.
// - Null/empty order color => no match => no snapshot.
// - No match => caller must NOT touch the existing snapshot (never clear
//   history on re-approve).
// - Re-approve overwrites with the current recipe ("snapshot = recipe at the
//   time of (last) approval").

export interface RecipeRow {
  id: string
  colorName: string
  colorVersion: string | null
  standardGsm: number
  firstBarSpec: string | null
  middleBarSpec: string | null
  backBarSpecs: string | null
  mbRate: number | null
  notes: string | null
}

export function normalizeRecipeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase()
}

/**
 * Normalize color name by stripping order code prefixes/suffixes and standardizing
 * common factory shorthand/typos found in actual production logs and orders.
 * Examples:
 *   "DESERT SAND#467" → "DESERT SAND"
 *   "#467 Desert Sand" → "DESERT SAND"
 *   "D.sand #467" → "DESERT SAND"
 *   "D.GREEN" → "DARK GREEN"
 *   "S.WHITE" → "SNOW WHITE"
 */
export function normalizeColorName(value: string | null | undefined): string {
  if (!value) return ''
  let v = value.trim().toUpperCase()
  // 1. Strip leading order code / swatch prefix (e.g. "#467 DESERT SAND", "#293 AQUA BLUE")
  v = v.replace(/^#\s*\d+[\s-]*/, '')
  // 2. Strip trailing order code / swatch suffix (e.g. "DESERT SAND #467", "STEEL GREY #421")
  v = v.replace(/[#\s]*\d+$/, '')
  // 3. Strip trailing auxiliary notes in parentheses (e.g. "(WATERPROOF)", "(BEIGE)")
  v = v.replace(/\s*\((?:WATERPROOF|BEIGE)\)\s*$/, '')
  v = v.trim()

  // 4. Map common factory shorthand & aliases
  if (v === 'D.SAND' || v === 'D. SAND' || v === 'DESSERT SAND' || v === 'DESERT') {
    return 'DESERT SAND'
  }
  if (v === 'D.GREEN' || v === 'D. GREEN' || v === 'DGREEN') {
    return 'DARK GREEN'
  }
  if (v === 'S.WHITE' || v === 'S. WHITE' || v === 'SWHITE') {
    return 'SNOW WHITE'
  }
  if (v === 'BEGIE' || v === 'BIEGE') {
    return 'BEIGE'
  }
  return v
}

/** Find the recipe for an order line, or null when there is none. */
export function matchRecipe(
  orderColor: string | null | undefined,
  orderVersion: string | null | undefined,
  recipes: RecipeRow[],
): RecipeRow | null {
  const color = normalizeColorName(orderColor)
  if (!color) return null
  const version = normalizeRecipeKey(orderVersion) || 'STD'
  return (
    recipes.find(
      (r) =>
        normalizeColorName(r.colorName) === color &&
        normalizeRecipeKey(r.colorVersion) === version,
    ) ?? null
  )
}

/** Serialize a recipe into the JSON string stored on the order. */
export function buildRecipeSnapshot(recipe: RecipeRow, nowIso: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    recipeId: recipe.id,
    colorName: recipe.colorName,
    colorVersion: recipe.colorVersion,
    standardGsm: recipe.standardGsm,
    firstBarSpec: recipe.firstBarSpec,
    middleBarSpec: recipe.middleBarSpec,
    backBarSpecs: recipe.backBarSpecs,
    mbRate: recipe.mbRate,
    notes: recipe.notes,
    snapshottedAt: nowIso,
  })
}
