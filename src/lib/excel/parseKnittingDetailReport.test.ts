import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
import { parseKnittingDetailReport } from './parseKnittingDetailReport'

function report(secondMachineTotal: number) {
  const machine: unknown[] = []; machine[1] = 6.8; machine[2] = 'MACHINE 2'
  const header: unknown[] = []; header[2] = 'NO.'; header[4] = 'COLOR'; header[11] = 'WEIGHT(KG)'; header[12] = 'TOTAL(KG)'
  const data: unknown[] = []; data[2] = 'D'; data[4] = 'BLUE'; data[11] = 12.5
  const firstTotal: unknown[] = []; firstTotal[0] = 2; firstTotal[2] = 'TOTAL'; firstTotal[12] = 12.5
  const secondTotal: unknown[] = []; secondTotal[0] = 2; secondTotal[2] = 'TOTAL'; secondTotal[12] = secondMachineTotal
  const cumulativeTotal: unknown[] = []; cumulativeTotal[2] = 'TOTAL'; cumulativeTotal[12] = 999
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['SNY VINA CO.,LTD.', '2026-05-01'], machine, header, data, firstTotal, cumulativeTotal,
    ['SNY VINA CO.,LTD.', '2026-05-02'], machine, header, data, secondTotal, cumulativeTotal,
  ]), 'KNITTING')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

function parseWithWarnings(buffer: Buffer) {
  const warnings: string[] = [], warn = console.warn
  console.warn = (...args: unknown[]) => warnings.push(args.join(' '))
  try { return { rows: parseKnittingDetailReport(buffer), warnings } }
  finally { console.warn = warn }
}

test('1810-08 compares the daily delta and ignores wider cumulative TOTAL lines', () => {
  const { rows, warnings } = parseWithWarnings(report(25))
  assert.equal(rows.length, 2)
  assert.equal(rows[0].weightKgs, 12.5)
  assert.deepEqual(warnings, [])
})

test('1810-08 still warns when a machine cumulative delta differs from data rows', () => {
  const { warnings } = parseWithWarnings(report(24))
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /TOTAL lũy kế chênh = 11\.5, sum WEIGHT = 12\.50/)
})
