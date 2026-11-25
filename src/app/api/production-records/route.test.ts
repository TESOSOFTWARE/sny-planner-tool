import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { withTestSession } from '@/lib/auth/testSession'

const singleton = globalThis as unknown as { prisma: unknown }, previous = singleton.prisma
let lastQuery: { where: { orderId?: unknown; orderRef?: unknown }; skip: number; take: number } | undefined
let calls = 0
const model = {
  findMany: async (query: NonNullable<typeof lastQuery>) => {
    calls++; lastQuery = query
    return [{ id: 'output', reportDate: new Date('2026-10-28Z'), date: new Date('2026-10-28Z'), orderRef: 'RAW PI text', orderId: null, color: 'BLUE', machineId: 'EXT-01', shift: 'D', denier: '1200', beamNote: '6 BEAM', weavingMachineRef: 'M-040', strand: '4', beamCount1: '2', mPerEa: '8000', weigValue: '15', beamCount2: '3', quantity: '4', width: '2', weightSpec: '90', lengthM: '100', tapeRoll: '50', mValue: '1000', avgPerRoll: '50', kilograms: '12.34', weightKgs: '12.34', machineNote: 'operator note', meshType: 'SMALL', machineSizeM: '6.8', cmPerMin: '90', meterPerDay: '1300', operatingGrade: 'A', totalPct: '99', widthM: 2, weightKgsOrder: '90', metricLabel: 'QUANTITY SMALL', metricValue: '3', unit: 'roll', note: 'packing note', dataSource: 'STATISTICAL REPORT 11-2026.xlsx' }]
  },
  count: async () => 151,
  aggregate: async () => ({ _sum: { mValue: '543.2', quantity: '6', weightKgs: '1234.5' } }),
  groupBy: async () => [{ metricLabel: 'QUANTITY SMALL', unit: 'roll', _sum: { metricValue: '6' } }, { metricLabel: 'WEIGHT BIG', unit: 'kg', _sum: { metricValue: '1234.5' } }],
}
let GET: typeof import('./route').GET
before(async () => {
  singleton.prisma = { extruderDailyOutput: model, warpingDailyOutput: model, knittingDailyDetail: model, rollingDailyMetric: model, manualProductionEntry: model }
  GET = withTestSession((await import('./route')).GET, singleton.prisma)
})
after(() => { singleton.prisma = previous })
test('each stage response retains its own Excel fields and preserves unresolved PI text', async () => {
  for (const stage of ['extruder', 'warping', 'knitting', 'rolling', 'packing']) {
    const response = await GET(new NextRequest('http://qa.invalid/api/production-records?stage=' + stage + '&q=RAW&state=unlinked&page=2&limit=50'))
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.equal(data.total, 151); assert.equal(data.records[0].orderRef, 'RAW PI text'); assert.equal(data.records[0].orderId, null)
    assert.equal(lastQuery?.skip, 50); assert.equal(lastQuery?.take, 50); assert.equal(lastQuery?.where.orderId, null)
    assert.deepEqual(lastQuery?.where.orderRef, { contains: 'RAW', mode: 'insensitive' })
    if (stage === 'extruder') { assert.equal(data.records[0].denier, '1200'); assert.equal(data.records[0].beamNote, '6 BEAM') }
    if (stage === 'warping') { assert.equal(data.records[0].weavingMachineRef, 'M-040'); assert.equal(data.records[0].strand, '4'); assert.equal(data.records[0].quantity, '4') }
    if (stage === 'knitting') { assert.equal(data.records[0].width, '2'); assert.equal(data.records[0].tapeRoll, '50'); assert.equal(data.records[0].machineSizeM, '6.8'); assert.equal(data.records[0].machineNote, 'operator note') }
    if (stage === 'rolling') { assert.equal(data.records[0].metric, 'QUANTITY SMALL'); assert.equal(data.records[0].kilograms, undefined); assert.equal(data.records[0].widthM, '2'); assert.equal(data.records[0].weightKgsOrder, '90') }
    if (stage === 'packing') { assert.equal(data.records[0].metric, 'QUANTITY SMALL'); assert.equal(data.records[0].unit, 'roll'); assert.equal(data.records[0].note, 'packing note') }
  }
})
test('search summary aggregates all matching PI rows, independently of the current page, without summing specification fields', async () => {
  for (const [stage, expected] of [
    ['extruder', [{ label: 'WEIGHT', value: '1234.5', unit: 'kg' }]],
    ['warping', [{ label: 'QUANTITY', value: '6' }, { label: 'WEIGHT', value: '1234.5', unit: 'kg' }]],
    ['knitting', [{ label: 'M', value: '543.2', unit: 'm' }, { label: 'QUANTITY', value: '6' }, { label: 'WEIGHT (kg)', value: '1234.5', unit: 'kg' }]],
    ['rolling', [{ label: 'QUANTITY SMALL', value: '6' }, { label: 'WEIGHT BIG', value: '1234.5' }]],
    ['packing', [{ label: 'QUANTITY SMALL', value: '6', unit: 'roll' }, { label: 'WEIGHT BIG', value: '1234.5', unit: 'kg' }]],
  ] as const) {
    const response = await GET(new NextRequest(`http://qa.invalid/api/production-records?stage=${stage}&q=RAW&page=2&limit=1`))
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.equal(data.records.length, 1)
    assert.equal(data.total, 151)
    assert.deepEqual(data.summary.metrics, expected)
  }
})
test('invalid filters and oversized page limits fail before data queries', async () => {
  const baseline = calls
  for (const query of ['stage=invalid', 'stage=extruder&limit=1000', 'stage=extruder&page=NaN', 'stage=extruder&state=guess']) {
    assert.equal((await GET(new NextRequest('http://qa.invalid/api/production-records?' + query))).status, 422)
  }
  assert.equal(calls, baseline)
})
test('shared pager supports its 200-row option', async () => {
  assert.equal((await GET(new NextRequest('http://qa.invalid/api/production-records?stage=extruder&limit=200'))).status, 200)
  assert.equal(lastQuery?.take, 200)
})
