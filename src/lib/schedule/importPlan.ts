import { createHash } from 'node:crypto'
import { draftPiCode, matchSchedulePi, type ParseScheduleResult } from '@/lib/excel/parseScheduleReport'

const normalizeCode = (value: string) => value.replace(/\([^)]*\)/g, '').replace(/\s+/g, '').toUpperCase()

export interface ScheduleCatalogueOrder { id: string; piNumber: string; subLineIndex: number; isPlaceholder: boolean }
export interface FirstLineLink { piNumber: string; lineCount: number; orderId: string; subLineIndex: number; isPlaceholder: boolean; cellCount: number }
export interface SupersededDraft { draftOrderId: string; draftPiNumber: string; realPiNumber: string; cellCount: number }
export interface ScheduleDraft { piNumber: string; rawValues: string[]; cellCount: number; nonPiName: boolean }
export function schedulePlanSnapshot(file: Buffer, sheetName: string, catalogue: readonly ScheduleCatalogueOrder[]): string {
  const rows = catalogue.map(row => [row.id, row.piNumber, row.subLineIndex, row.isPlaceholder]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return createHash('sha256').update(file).update(JSON.stringify([sheetName, rows])).digest('hex')
}
export function buildScheduleImportPlan(parsed: ParseScheduleResult, catalogue: readonly ScheduleCatalogueOrder[]) {
  const firstLineLinks: FirstLineLink[] = [], toCreateDraftOrders: ScheduleDraft[] = [], needsManual: {rawValue: string; reason: string}[] = [], skippedInvalid: string[] = []
  const toCreateAssignments: {machineId: string; piNumber: string; orderId: string | null; startDate: string; endDate: string}[] = []
  let singleCount = 0, multiCount = 0, draftCellCount = 0, invalidCellCount = 0
  const realKeys = new Set(catalogue.filter(row => !row.isPlaceholder).map(row => normalizeCode(row.piNumber)))
  const effective = catalogue.filter(row => !row.isPlaceholder || !realKeys.has(normalizeCode(row.piNumber)))
  const supersededDrafts: SupersededDraft[] = []
  const known = effective.map(row => row.piNumber)
  for (const cell of parsed.assignments) {
    const match = matchSchedulePi(cell.rawValue, known)
    if (cell.isInvalid || match.piNumbers.length === 0) { invalidCellCount++; if (!skippedInvalid.includes(cell.rawValue)) skippedInvalid.push(cell.rawValue); continue }
    if (cell.rawValue.replace(/\([^)]*\)/g, '').includes('+') || match.kind === 'collision') {
      needsManual.push({rawValue: cell.rawValue, reason: match.kind === 'collision' ? 'PI trùng sau chuẩn hoá' : 'Ô ghép nhiều PI'}); continue
    }
    const baseCode = draftPiCode(cell.rawValue)
    const nonPiName = !/\d/.test(baseCode)
    // User decision 12/10: preserve full source identity for non-PI names.
    // VIVIAN- INTERWAY and VIVIAN- FENCE NET 12WALE must remain separate.
    let piNumber = match.kind === 'unknown' ? (nonPiName ? cell.rawValue.trim().replace(/\s+/g, ' ') : baseCode) : match.piNumbers[0]
    if (!piNumber) { invalidCellCount++; if (!skippedInvalid.includes(cell.rawValue)) skippedInvalid.push(cell.rawValue); continue }
    if (match.kind === 'unknown') {
      if (effective.some(row => normalizeCode(row.piNumber) === normalizeCode(piNumber))) {
        needsManual.push({rawValue: cell.rawValue, reason: 'Mã nháp sau tách trùng PI có sẵn — cần kiểm liên kết'}); continue
      }
      piNumber = toCreateDraftOrders.find(row => normalizeCode(row.piNumber) === normalizeCode(piNumber))?.piNumber ?? piNumber
    }
    const rows = effective.filter(row => row.piNumber === piNumber).sort((a,b) => a.subLineIndex-b.subLineIndex || a.id.localeCompare(b.id))
    const selected = rows[0]
    if (selected) {
      for (const draft of catalogue.filter(row => row.isPlaceholder && realKeys.has(normalizeCode(row.piNumber)) && normalizeCode(row.piNumber) === normalizeCode(selected.piNumber))) {
        let superseded = supersededDrafts.find(row => row.draftOrderId === draft.id)
        if (!superseded) { superseded = {draftOrderId: draft.id, draftPiNumber: draft.piNumber, realPiNumber: selected.piNumber, cellCount: 0}; supersededDrafts.push(superseded) }
        superseded.cellCount++
      }
      if (rows.length > 1) {
        multiCount++
        let group = firstLineLinks.find(row => row.piNumber === piNumber)
        if (!group) { group = {piNumber: selected.piNumber, subLineIndex: selected.subLineIndex, isPlaceholder: selected.isPlaceholder, lineCount: rows.length, orderId: selected.id, cellCount: 0}; firstLineLinks.push(group) }
        group.cellCount++
      } else singleCount++
    } else {
      draftCellCount++
      let draft = toCreateDraftOrders.find(row => row.piNumber === piNumber)
      if (!draft) { draft = {piNumber, rawValues: [], cellCount: 0, nonPiName}; toCreateDraftOrders.push(draft) }
      if (!draft.rawValues.includes(cell.rawValue)) draft.rawValues.push(cell.rawValue)
      draft.cellCount++
    }
    toCreateAssignments.push({machineId: cell.machineId, piNumber, orderId: selected?.id ?? null, startDate: cell.startDate, endDate: cell.endDate})
  }
  return {supersededDrafts, firstLineLinks, toCreateDraftOrders, needsManual, skippedInvalid, toCreateAssignments, singleCount, multiCount, draftCellCount, invalidCellCount}
}
