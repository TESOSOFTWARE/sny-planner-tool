import { normalizeMaterialName, type ParsedMaterialRow } from '@/lib/excel/parseMaterialReport'

// [MoM §3.2] Source metadata is included only when supplied, preserving legacy payloads.
export function materialReportPayload(row: ParsedMaterialRow) {
  return {
    materialName: normalizeMaterialName(row.materialName),
    firstStock: row.firstStock, inQty: row.inQty, outUsing: row.outUsing,
    outBroken: row.outBroken, outTape: row.outTape, outReject: row.outReject, lastStock: row.lastStock,
    ...(row.subGroup ? { subGroup: row.subGroup } : {}),
    ...(row.lightFastness ? { lightFastness: row.lightFastness } : {}),
    ...(row.color ? { color: row.color } : {}),
    ...(row.colorName ? { colorName: row.colorName } : {}),
    ...(row.brand ? { brand: row.brand } : {}),
    ...(row.itemCode ? { itemCode: row.itemCode } : {}),
  }
}

export function sameMaterialReport(payload: unknown, row: ParsedMaterialRow) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const stored = payload as Record<string, unknown>
  const proposed = materialReportPayload(row)
  const keys = [...Object.keys(proposed), 'subGroup', 'lightFastness', 'color', 'colorName', 'brand', 'itemCode']
  return keys.every(key => (stored[key] ?? null) === ((proposed as Record<string, unknown>)[key] ?? null))
}

// Import fills missing catalog metadata; it never replaces a manual classification.
export function importedTaxonomy(row: ParsedMaterialRow, material?: { subGroup?: string | null; lightFastness?: string | null; color?: string | null; brand?: string | null }) {
  return {
    ...(!material?.subGroup && row.subGroup ? { subGroup: row.subGroup } : {}),
    ...(!material?.lightFastness && row.lightFastness ? { lightFastness: row.lightFastness } : {}),
    ...(row.group === 'MB' && !material?.color && row.color ? { color: row.color } : {}),
    ...(row.group === 'MB' && !material?.brand && row.brand ? { brand: row.brand } : {}),
  }
}
