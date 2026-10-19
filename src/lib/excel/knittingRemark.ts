// [NỢ KỸ THUẬT R8 / 1510-06 cách C] Source spelling is preserved; keys only compare.
import { productionPi } from './productionPi'
export const normalizeRemark = (raw: string): string => raw.trim().replace(/\s+/g, ' ')
export const remarkKey = (raw: string): string => normalizeRemark(raw).toUpperCase()
export const INITIAL_MESH_TYPES: readonly string[] = [
  'ANTI EROSION NET', 'CAPONY BIRD NET', 'DIAMOND BIRD NET', 'FENCE NET',
  'HAIL NET', 'HEAVY DUTY SPORTS NET', 'Hex bird net', 'JAPANESE MESH', 'LEAF NET',
  'QUAD HAIL NET', 'QUAD HAIL NETTING', 'RECTANGULAR NET', 'Scaffolding',
  'SHADE MONO TAPE', 'SHADE NET MONO', 'SHADE NET MONO TAPE', 'SHADE NET TAPE TAPE',
  'WINDBREAK NET', 'WINDBREAKNET',
]
export type RemarkClass = 'PI' | 'NOTE_STAR' | 'MESH_KNOWN' | 'UNKNOWN'
export type RemarkDecision = { value: string; target: 'MESH' | 'NOTE' }
export type RemarkValue = { value: string; count: number; status: RemarkClass }
export type RemarkContext = { knownMeshKeys: Set<string>; resolvePi: (value: string) => string | null }
export function knownMeshKeys(saved: readonly (string | null)[]): Set<string> {
  return new Set([...INITIAL_MESH_TYPES, ...saved.filter((v): v is string => !!v)].map(remarkKey))
}
export function classifyRemark(raw: string, context: RemarkContext): RemarkClass {
  if (context.resolvePi(raw) !== null || productionPi(raw) !== null) return 'PI'
  if (normalizeRemark(raw).startsWith('*')) return 'NOTE_STAR'
  return context.knownMeshKeys.has(remarkKey(raw)) ? 'MESH_KNOWN' : 'UNKNOWN'
}
type RemarkRow = { sourceOrderRefs?: string[]; orderRef: string | null; machineNote: string | null }
const refsOf = (row: RemarkRow) => row.sourceOrderRefs ?? (row.orderRef ? [row.orderRef] : [])
export function collectRemarkValues(rows: readonly RemarkRow[], context: RemarkContext): RemarkValue[] {
  const values = new Map<string, RemarkValue>()
  for (const row of rows) for (const raw of Array.from(new Set(refsOf(row).map(remarkKey)))) {
    if (!raw) continue
    const existing = values.get(raw)
    if (existing) existing.count++
    else {
      const source = refsOf(row).find(value => remarkKey(value) === raw)!
      values.set(raw, { value: normalizeRemark(source), count: 1, status: classifyRemark(source, context) })
    }
  }
  return Array.from(values.values())
}
export class RemarkDecisionRequired extends Error {
  constructor(public values: string[]) { super('Chọn Loại lưới hoặc Ghi chú cho tất cả giá trị REMARK mới.') }
}
export function applyRemarkDecisions<T extends RemarkRow>(rows: readonly T[], context: RemarkContext, decisions: readonly RemarkDecision[]) {
  const targets = new Map(decisions.map(decision => [remarkKey(decision.value), decision.target]))
  const missing = collectRemarkValues(rows, context).filter(value => value.status === 'UNKNOWN' && !targets.has(remarkKey(value.value)))
  if (missing.length) throw new RemarkDecisionRequired(missing.map(value => value.value))
  return rows.map(row => {
    // Keep the parser's header-note patterns, including operational headers without '*'.
    // Remove any preview copy of raw REMARK first; that part is rebuilt below.
    const rawKeys = new Set(refsOf(row).map(remarkKey))
    const notes = (row.machineNote ?? '').split(' · ').filter(note => !rawKeys.has(remarkKey(note)) &&
      (normalizeRemark(note).startsWith('*') || /thay\s*dàn|đổi\s*màu|sửa\s*máy|bảo\s*trì/i.test(note)))
    let meshType: string | null = null
    let orderRef: string | null = null
    for (const raw of refsOf(row)) {
      if (!remarkKey(raw)) continue
      const status = classifyRemark(raw, context)
      if (status === 'PI') orderRef = raw
      else if (status === 'MESH_KNOWN' || (status === 'UNKNOWN' && targets.get(remarkKey(raw)) === 'MESH')) meshType = normalizeRemark(raw)
      else notes.push(normalizeRemark(raw))
    }
    return { ...row, orderRef, meshType, machineNote: Array.from(new Set(notes)).join(' · ') || null }
  })
}
