import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
import { prepareStatisticalReportUpload } from './uploadTrim'

test('statistical report upload retains only the five named sheets, independent of nearby tabs', async () => {
  const workbook = XLSX.utils.book_new()
  for (const name of ['HDPE KO SỬ DỤNG', 'HDPE ', 'EXTRUDER', 'WARPING', 'KNITTING', 'ROLLING ', 'SẢN LƯỢNG ĐÓNG GÓI', 'CHART']) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[name]]), name)
  }
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const upload = new File([Uint8Array.from(buffer)], 'STATISTICAL REPORT 11-2026.xlsx')
  const trimmed = await prepareStatisticalReportUpload(upload)
  const parsed = XLSX.read(await trimmed.arrayBuffer(), { type: 'array' })
  assert.deepEqual(parsed.SheetNames, ['HDPE ', 'EXTRUDER', 'WARPING', 'KNITTING', 'ROLLING '])
})
