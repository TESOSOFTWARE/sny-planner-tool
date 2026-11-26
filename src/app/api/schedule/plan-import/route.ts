import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { authError } from '@/lib/auth/session'
import { parseStagePlanWorkbook, type StagePlanProfile } from '@/lib/excel/parseStagePlanWorkbook'
import { MAX_REPORT_UPLOAD_BYTES } from '@/lib/excel/uploadTrim'

const profiles = ['extruder-machine', 'fiber-demand-matrix', 'warping-work-order', 'pallet-dated'] as const
const MAX_ROWS = 50_000
const PREVIEW_ROWS = 200
const snapshotHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export async function POST(request: NextRequest) {
  const denied = await authError('POST', request, 'output.read')
  if (denied) return denied
  let form: FormData
  try { form = await request.formData() }
  catch { return NextResponse.json({ success: false, error: 'Không đọc được form upload.' }, { status: 400 }) }

  const file = form.get('file'), profile = String(form.get('profile') ?? '')
  if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Chọn file kế hoạch trước.' }, { status: 400 })
  if (!profiles.includes(profile as StagePlanProfile)) return NextResponse.json({ success: false, error: 'Chọn loại kế hoạch được hỗ trợ.' }, { status: 422 })
  const extensions = profile === 'warping-work-order' ? ['.xlsb', '.xlsx'] : ['.xlsx']
  if (!extensions.some(extension => file.name.toLowerCase().endsWith(extension))) return NextResponse.json({ success: false, error: `Profile này nhận file ${extensions.join(' hoặc ')}.` }, { status: 422 })
  if (file.size > MAX_REPORT_UPLOAD_BYTES) return NextResponse.json({ success: false, error: 'File vượt giới hạn tải lên 4,4 MB của hệ thống. Hãy tách file theo kỳ/sheet rồi tải từng phần.' }, { status: 413 })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = parseStagePlanWorkbook(buffer, file.name, profile as StagePlanProfile, String(form.get('sheet') ?? '') || undefined, Number(form.get('year')) || undefined, String(form.get('period') ?? '') || undefined)
    if (parsed.needsSheetSelection) return NextResponse.json({ success: true, ...parsed })
    if (parsed.rows.length > MAX_ROWS) return NextResponse.json({ success: false, error: `Sheet/profile tạo ${parsed.rows.length.toLocaleString('vi-VN')} dòng; giới hạn xem trước là ${MAX_ROWS.toLocaleString('vi-VN')}.` }, { status: 413 })
    const fileHash = createHash('sha256').update(buffer).digest('hex')
    const expectedSnapshot = snapshotHash({ fileHash, profile: parsed.profile, scopeKey: parsed.scopeKey, rows: parsed.rows })
    const { rows, ...metadata } = parsed
    return NextResponse.json({ success: true, ...metadata, rows: rows.slice(0, PREVIEW_ROWS), totalRows: rows.length, datedCount: rows.filter(row => row.planDate).length, undatedCount: rows.filter(row => !row.planDate).length, previewTruncated: rows.length > PREVIEW_ROWS, fileHash, expectedSnapshot })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Không phân tích được file kế hoạch.' }, { status: 422 })
  }
}
