import * as XLSX from 'xlsx'

/** Generate synthetic data with SheetJS, then add OOXML fills because CE's
 * writer does not retain arbitrary cell fills. No customer file is a fixture. */
export function scheduleFixture(fills: Record<string, string> = {}): Buffer {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([
    [], [], [], ['JAN–2026'], [],
    ['', '', ...Array.from({ length: 31 }, (_, i) => i + 1)],
    ['6.85', '', 'QA26-001'],
  ])
  XLSX.utils.book_append_sheet(wb, ws, '2.1.2026 ')
  const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  if (Object.keys(fills).length === 0) return bytes
  const zip = XLSX.CFB.read(bytes, { type: 'buffer' })
  const stylesIndex = zip.FullPaths.findIndex((path: string) => path.endsWith('/xl/styles.xml'))
  const sheetIndex = zip.FullPaths.findIndex((path: string) => path.endsWith('/xl/worksheets/sheet1.xml'))
  const styles = zip.FileIndex[stylesIndex]
  const sheet = zip.FileIndex[sheetIndex]
  if (!styles?.content || !sheet?.content) throw new Error('Fixture XML missing')
  let styleXml = Buffer.from(styles.content).toString('utf8')
  let sheetXml = Buffer.from(sheet.content).toString('utf8')
  const colors = Array.from(new Set(Object.values(fills)))
  styleXml = styleXml.replace(/<fills count="2">/, `<fills count="${2 + colors.length}">`)
    .replace('</fills>', colors.map(rgb => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`).join('') + '</fills>')
    .replace(/<cellXfs count="1">/, `<cellXfs count="${1 + colors.length}">`)
    .replace('</cellXfs>', colors.map((_, i) => `<xf numFmtId="0" fontId="0" fillId="${i + 2}" borderId="0" xfId="0" applyFill="1"/>`).join('') + '</cellXfs>')
  for (const [addr, rgb] of Object.entries(fills)) {
    sheetXml = sheetXml.replace(`<c r="${addr}"`, `<c s="${colors.indexOf(rgb) + 1}" r="${addr}"`)
  }
  XLSX.CFB.utils.cfb_add(zip, zip.FullPaths[stylesIndex], Buffer.from(styleXml))
  XLSX.CFB.utils.cfb_add(zip, zip.FullPaths[sheetIndex], Buffer.from(sheetXml))
  return Buffer.from(XLSX.CFB.write(zip, { type: 'buffer', fileType: 'zip' }))
}
