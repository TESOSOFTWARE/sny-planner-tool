import * as XLSX from 'xlsx'
import { MAX_REPORT_UPLOAD_BYTES } from './uploadTrim'
import type { StagePlanProfile } from './parseStagePlanWorkbook'

function isWarpingWorkOrder(sheet: XLSX.WorkSheet): boolean {
  if (!sheet['!ref']) return false
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][]
  const valueText = (value: unknown) => value == null ? '' : String(value).trim()
  const normalized = (value: unknown) => valueText(value).replace(/\s+/g, ' ').toUpperCase()
  const title = rows.findIndex(row => row.some(value => /WARPING\s+WORK\s+ORDER/i.test(valueText(value))))
  if (title < 0) return false
  return rows.some((row, index) => index > title && row.some(value => normalized(value).includes('DENIOR')) && row.some(value => normalized(value).includes('STRAND')) && row.some(value => normalized(value).includes('WEAVING NO')))
}

function xlsxFile(source: File, workbook: XLSX.WorkBook, sheetNames: string[], part: number): File {
  const subset = XLSX.utils.book_new()
  subset.Workbook = { WBProps: { ...workbook.Workbook?.WBProps } }
  for (const name of sheetNames) XLSX.utils.book_append_sheet(subset, workbook.Sheets[name], name)
  const bytes = XLSX.write(subset, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer
  const base = source.name.replace(/\.[^.]+$/, '')
  return new File([bytes], `${base}-part-${part}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', lastModified: source.lastModified })
}

/** Split oversized CC2018 work-order books in the browser before sending requests through the platform's body-size limit. */
export async function prepareStagePlanFiles(source: File, profile: StagePlanProfile): Promise<File[]> {
  if (source.size <= MAX_REPORT_UPLOAD_BYTES) return [source]
  if (profile !== 'warping-work-order') throw new Error('File vượt giới hạn tải lên 4,4 MB. Với file kế hoạch tháng, hãy chọn sheet/kỳ cần nhập hoặc lưu workbook chỉ còn sheet đó.')

  let workbook: XLSX.WorkBook
  try { workbook = XLSX.read(await source.arrayBuffer(), { type: 'array', cellDates: false, cellNF: true }) }
  catch { throw new Error('Không đọc được workbook WARPING. Hãy kiểm tra file rồi thử lại.') }
  const sheets = workbook.SheetNames.filter(name => isWarpingWorkOrder(workbook.Sheets[name]))
  if (!sheets.length) throw new Error('Không tìm thấy sheet WARPING WORK ORDER trong file.')

  const groups: string[][] = []
  const pack = (names: string[]) => {
    const candidate = xlsxFile(source, workbook, names, groups.length + 1)
    if (candidate.size <= MAX_REPORT_UPLOAD_BYTES) { groups.push(names); return }
    if (names.length === 1) throw new Error(`Sheet “${names[0]}” lớn hơn giới hạn tải lên 4,4 MB; cần tách sheet này tại nguồn.`)
    const middle = Math.ceil(names.length / 2)
    pack(names.slice(0, middle)); pack(names.slice(middle))
  }
  const initialGroupSize = 16
  for (let index = 0; index < sheets.length; index += initialGroupSize) pack(sheets.slice(index, index + initialGroupSize))
  return groups.map((names, index) => xlsxFile(source, workbook, names, index + 1))
}
