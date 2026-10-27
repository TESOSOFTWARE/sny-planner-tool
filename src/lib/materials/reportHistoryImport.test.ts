import test from 'node:test'
import assert from 'node:assert/strict'
import { planHistoryImport, historyPayload } from './reportHistoryImport'
import type { ParsedMaterialReportDay } from '@/lib/excel/parseMaterialReport'

const row: ParsedMaterialReportDay = { materialName:'MF', group:'HDPE', sheetName:'HDPE',headerRow:3, reportDate:'2026-04-04', firstStock:100, inQty:20, outUsing:10, outBroken:0, outTape:0, outReject:0, lastStock:110, sourceRow:4, isValid:true, validationErrors:[] }
const material = { id:'m1', name:' mf ', group:'HDPE', stockReportDate:new Date('2026-04-30Z') }
const file = {name:'report.xlsx',size:10}
test('TC-01-01 seven outcomes follow priority and normalization',()=>{
 const rows = [ {...row,materialName:'INVALID',isValid:false,validationErrors:['Thiếu tồn']}, {...row,materialName:'UNKNOWN'}, {...row,materialName:'AMB'}, {...row,materialName:'FUTURE'}, {...row,materialName:'SAME'}, {...row,materialName:'DIFF'}, row ]
 const materials=[material,...['AMB','AMB','FUTURE','SAME','DIFF'].map((name,i)=>({...material,id:String(i),name,stockReportDate:name==='FUTURE'?new Date('2026-04-01Z'):material.stockReportDate}))]
 const snapshots=[{materialId:'3',reportDate:new Date('2026-04-04Z'),payload:historyPayload({...row,materialName:'SAME'})},{materialId:'4',reportDate:new Date('2026-04-04Z'),payload:historyPayload({...row,materialName:'DIFF',lastStock:99})}]
 const plan=planHistoryImport(rows,materials,snapshots,file)
 assert.deepEqual(Object.values(plan.preview.counts),[1,1,1,1,1,2]);assert.equal(plan.writes.length,2)
})
test('TC-01-02 combined period and missing source cells remain intact',()=>{
 const merged={...row,sourceDateLabel:'04+05/04/2026',reportPeriodEnd:'2026-04-05',missingFields:['inQty']}
 const payload=historyPayload(merged)
 assert.equal(payload.reportPeriodEnd,'2026-04-05');assert.equal(payload.sourceDateLabel,'04+05/04/2026');assert.deepEqual(payload.missingFields,['inQty'])
 assert.equal(planHistoryImport([merged],[material],[],file).writes[0].reportDate.toISOString(),'2026-04-04T00:00:00.000Z')
})
test('TC-01-03 material without stock date accepts historical periods',()=>{
 assert.equal(planHistoryImport([row],[{...material,stockReportDate:null}],[],file).preview.counts.new,1)
})
test('TC-01-04 MB identity stays distinct from HDPE',()=>{
 const plan=planHistoryImport([{...row,group:'MB'}],[material,{...material,id:'mb',group:'MB'}],[],file)
 assert.equal(plan.writes[0].materialId,'mb')
})
test('TC-01-07 preview hash changes when planned material or payload changes',()=>{
 const hash=planHistoryImport([row],[material],[],file).preview.expectedSnapshot
 assert.notEqual(hash,planHistoryImport([row],[{...material,id:'m2'}],[],file).preview.expectedSnapshot)
 assert.notEqual(hash,planHistoryImport([{...row,lastStock:99}],[material],[],file).preview.expectedSnapshot)
})
test('TC-01-10 duplicate normalized material-period is rejected',()=>{
 assert.throws(()=>planHistoryImport([row,{...row,materialName:' mf '}],[material],[],file),/Trùng/)
})
test('TC-01-12 changed period or tracked missing source cells preserve existing snapshot',()=>{
 const snapshots=[{materialId:material.id,reportDate:new Date('2026-04-04Z'),payload:historyPayload(row)}]
 for(const changed of [{...row,reportPeriodEnd:'2026-04-05'}]){
  const plan=planHistoryImport([changed],[material],snapshots,file)
  assert.equal(plan.preview.counts.conflict_existing,1);assert.equal(plan.writes.length,0)
 }
 const untracked=planHistoryImport([{...row,missingFields:['inQty']}],[material],snapshots,file)
 assert.equal(untracked.preview.counts.identical,1)
 const trackedSnapshots=[{materialId:material.id,reportDate:new Date('2026-04-04Z'),payload:historyPayload({...row,missingFields:['outTape']})}]
 const tracked=planHistoryImport([{...row,missingFields:['inQty']}],[material],trackedSnapshots,file)
 assert.equal(tracked.preview.counts.conflict_existing,1);assert.equal(tracked.writes.length,0)
})

test('1910-02: snapshot without missingFields is identical to a historical row with source blanks',()=>{
 const snapshots=[{materialId:material.id,reportDate:new Date('2026-04-04Z'),payload:historyPayload(row)}]
 const plan=planHistoryImport([{...row,missingFields:['outTape','outReject']}],[material],snapshots,file)
 assert.equal(plan.preview.counts.identical,1);assert.equal(plan.preview.counts.conflict_existing,0)
})
test('1910-02: tracked missingFields remain a named conflict when they differ',()=>{
 const stored={...historyPayload({...row,missingFields:['outTape']}),missingFields:['outTape']}
 const snapshots=[{materialId:material.id,reportDate:new Date('2026-04-04Z'),payload:stored}]
 const plan=planHistoryImport([{...row,missingFields:['outReject']}],[material],snapshots,file)
 assert.equal(plan.preview.counts.conflict_existing,1)
 assert.deepEqual(plan.preview.skippedRows[0].differences,[{field:'missingFields',stored:['outTape'],incoming:['outReject']}])
})
test('1910-02: a changed stock value remains a named conflict',()=>{
 const stored={...historyPayload({...row,missingFields:['outTape']}),missingFields:['outTape']}
 const snapshots=[{materialId:material.id,reportDate:new Date('2026-04-04Z'),payload:stored}]
 const plan=planHistoryImport([{...row,lastStock:109,missingFields:['outTape']}],[material],snapshots,file)
 assert.equal(plan.preview.counts.conflict_existing,1)
 assert.deepEqual(plan.preview.skippedRows[0].differences,[{field:'lastStock',stored:110,incoming:109}])
})
test('1910-02 R-1: an untracked missingFields list is omitted from a numeric conflict',()=>{
 const snapshots=[{materialId:material.id,reportDate:new Date('2026-04-04Z'),payload:historyPayload(row)}]
 const plan=planHistoryImport([{...row,lastStock:109,missingFields:['outTape']}],[material],snapshots,file)
 assert.equal(plan.preview.counts.conflict_existing,1)
 assert.deepEqual(plan.preview.skippedRows[0].differences,[{field:'lastStock',stored:110,incoming:109}])
})
