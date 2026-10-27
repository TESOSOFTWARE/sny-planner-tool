import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseWarpingReport } from './parseWarpingReport'

type Block = { date?: number; company?: string; color?: string; weight?: number }
function fixture(blocks: Block[]): Buffer {
  const rows: unknown[][] = []
  for (const block of blocks) {
    rows.push([null, block.company ?? 'SNY VINA CO.,LTD.'])
    rows.push([null, 'Address'])
    rows.push([null, 'WARPING'])
    rows.push([block.date ?? null])
    rows.push([null, null, 'MACHINE 1'])
    rows.push(['STT', 'MÁY DỆT', 'COLOR', 'DENIER', 'STRAND', 'BEAM', 'M/EA', 'WEIG', 'BEAM', 'QUANTITY', 'WEIGHT', 'TOTAL', 'RE MARK'])
    if (block.color !== undefined || block.weight !== undefined) rows.push(['D', '40', block.color ?? '', null, null, null, null, null, null, null, block.weight ?? 0])
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'WARPING')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
const day = (date: Date) => date.toISOString().slice(0, 10)
test('separate titles detect three dates despite changed company rows', () => {
  const rows = parseWarpingReport(fixture([
    { date: 46310, color: 'RED' },
    { date: 46311, company: '%', color: 'BLUE' },
    { date: 46314, company: '%', color: 'WHITE' },
  ]))
  assert.deepEqual(rows.map(row => day(row.reportDate)), ['2026-10-15', '2026-10-16', '2026-10-19'])
})
test('rejects two populated blocks with the same date', () => {
  assert.throws(() => parseWarpingReport(fixture([{ date: 46310, color: 'RED' }, { date: 46310, color: 'BLUE' }])), /trùng.*dòng.*và/)
})
test('rejects populated block with missing date including weight without color', () => {
  assert.throws(() => parseWarpingReport(fixture([{ date: 46310, color: 'RED' }, { weight: 10 }])), /không có ngày báo cáo/)
})
test('ignores a repeated empty block', () => {
  const rows = parseWarpingReport(fixture([{ date: 46310, color: 'RED' }, { date: 46310 }]))
  assert.equal(rows.length, 1)
})
test('preserves legacy company-header workbook', () => {
  const rows = parseWarpingReport(fixture([{ date: 46146, color: 'BLACK', weight: 4 }]))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].weightKgs, 4)
})
