import test from 'node:test'
import assert from 'node:assert/strict'
import { planHistoryImport, historyPayload, type HistorySnapshot, type MonthlyHistoryMaterial } from './reportHistoryImport'
import { materialReportKey, type ParsedMaterialReportDay } from '@/lib/excel/parseMaterialReport'

const base: ParsedMaterialReportDay = { materialName: 'MF', group: 'HDPE', sheetName: 'HDPE', headerRow: 3, reportDate: '2026-10-23', firstStock: 100, inQty: 20, outUsing: 10, outBroken: 0, outTape: 0, outReject: 0, lastStock: 110, sourceRow: 4, isValid: true, validationErrors: [] }
const m: MonthlyHistoryMaterial = { id: 'm1', name: 'MF', group: 'HDPE', currentStock: 90, stockReportDate: new Date('2026-05-14T00:00:00Z'), stockReportDirty: false }
const file = { name: 'fixture.xlsx', size: 10 }
const plan = (rows = [base], materials = [m], snapshots: HistorySnapshot[] = [], resolutions = {}, txs: { id: string; materialId: string; txDate: Date }[] = []) => planHistoryImport(rows, materials, snapshots, file, resolutions, txs)
test('newer period creates history and updates stock', () => { const p = plan(); assert.equal(p.writes.length, 1); assert.equal(p.stockUpdates[0].to.stock, 110) })
test('older import does not replace newer report', () => { const s = { materialId:'m1', reportDate:new Date('2026-11-01Z'), payload:historyPayload({...base, reportDate:'2026-11-01',lastStock:125}) }; assert.equal(plan([base],[{...m,stockReportDate:new Date('2026-11-01Z')}],[s]).stockUpdates[0].to.stock,125) })
test('combined period uses end date', () => { assert.equal(plan([{...base,reportPeriodEnd:'2026-10-25'}]).stockUpdates[0].to.date,'2026-10-25') })
test('overlap with existing snapshot rejects period and keeps stock', () => { const s = { materialId:'m1', reportDate:new Date('2026-10-24Z'), payload:historyPayload({...base,reportDate:'2026-10-24'}) }; const p=plan([{...base,reportPeriodEnd:'2026-10-25'}],[m],[s]); assert.equal(p.preview.counts.conflict_existing,1); assert.equal(p.writes.length,0); assert.equal(p.stockUpdates.length,0) })
test('manual transaction after baseline holds stock even before report end', () => { const p=plan([base],[m],[],{},[{id:'t1',materialId:'m1',txDate:new Date('2026-06-01Z')}]); assert.equal(p.stockKept[0].reason,'manual_tx') })
test('manual transaction on material without baseline holds stock', () => { const p=plan([base],[{...m,stockReportDate:null}],[],{},[{id:'t1',materialId:'m1',txDate:new Date('2026-06-01Z')}]); assert.equal(p.stockKept[0].reason,'manual_tx') })
test('manual stock edit holds stock', () => { assert.equal(plan([base],[{...m,stockReportDirty:true}]).stockKept[0].reason,'manual_stock_edit') })
test('existing material without baseline holds stock', () => { assert.equal(plan([base],[{...m,stockReportDate:null}]).stockKept[0].reason,'no_report_baseline') })
test('new material creation proposes stock and default skip', () => { const key=materialReportKey('HDPE','MF'); assert.equal(plan([base],[]).preview.counts.unknown_material,1); const p=plan([base],[],[],{[key]:{action:'create'}}); assert.equal(p.creations.size,1); assert.equal(p.stockUpdates[0].to.stock,110) })
test('mapped material must be in same group', () => { const key=materialReportKey('HDPE','MF'); assert.equal(plan([base],[{...m,name:'other',group:'MB'}],[],{[key]:{action:'map',materialId:'m1'}}).preview.counts.invalid,1) })
test('mapping two aliases to one material on same date is rejected', () => { const key=materialReportKey('HDPE','alias'); assert.throws(()=>plan([base,{...base,materialName:'alias'}],[m],[],{[key]:{action:'map',materialId:'m1'}}),/cùng trỏ/) })
test('same resolved aliases on separate dates are accepted', () => { const key=materialReportKey('HDPE','alias'); assert.equal(plan([base,{...base,materialName:'alias',reportDate:'2026-10-24'}],[m],[],{[key]:{action:'map',materialId:'m1'}}).writes.length,2) })
test('same existing snapshot is identical', () => { const s={materialId:'m1',reportDate:new Date('2026-10-23Z'),payload:historyPayload(base)}; assert.equal(plan([base],[m],[s]).preview.counts.identical,1) })
test('resolution and concurrent manual transaction affect preview hash', () => { const key=materialReportKey('HDPE','unknown'), rows=[{...base,materialName:'unknown'}]; assert.notEqual(plan(rows,[]).preview.expectedSnapshot,plan(rows,[],[],{[key]:{action:'create'}}).preview.expectedSnapshot); assert.notEqual(plan().preview.expectedSnapshot,plan([base],[m],[],{},[{id:'t1',materialId:'m1',txDate:new Date('2026-06-01Z')}]).preview.expectedSnapshot) })

test('suggests existing shorter name as prefix of source name', () => {
  const source = { ...base, materialName: 'HD GHI BLACK' }
  const existing = { ...m, name: 'HD GHI' }
  const result = plan([source], [existing])
  assert.equal(result.preview.unknownMaterials[0].candidates[0]?.id, existing.id)
})

test('mapped alias with matching snapshot values is identical while source name remains in payload', () => {
  const alias = { ...base, materialName: 'SOURCE ALIAS' }
  const snapshot = { materialId: 'm1', reportDate: new Date('2026-10-23Z'), payload: historyPayload(base) }
  const key = materialReportKey('HDPE', alias.materialName)
  const result = plan([alias], [m], [snapshot], { [key]: { action: 'map', materialId: 'm1' } })
  assert.equal(result.preview.counts.identical, 1)
  assert.equal(result.writes.length, 0)
  assert.equal(historyPayload(alias).materialName, 'SOURCE ALIAS')
  const changed = plan([{ ...alias, lastStock: 111 }], [m], [snapshot], { [key]: { action: 'map', materialId: 'm1' } })
  assert.equal(changed.preview.counts.conflict_existing, 1)
})
