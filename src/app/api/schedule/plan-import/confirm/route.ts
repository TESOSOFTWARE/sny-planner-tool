import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'
import { parseStagePlanWorkbook, type StagePlanProfile } from '@/lib/excel/parseStagePlanWorkbook'
import { MAX_REPORT_UPLOAD_BYTES } from '@/lib/excel/uploadTrim'

const profiles = ['extruder-machine', 'fiber-demand-matrix', 'warping-work-order', 'pallet-dated'] as const
const MAX_ROWS = 50_000
const jsonInput = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
const snapshotHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export async function POST(request: NextRequest) {
  const denied = await authError('POST', request, 'output.plan.create')
  if (denied) return denied

  let form: FormData
  try { form = await request.formData() }
  catch { return NextResponse.json({ success: false, error: 'Không đọc được form upload.' }, { status: 400 }) }
  const file = form.get('file'), profile = String(form.get('profile') ?? ''), selectedSheet = String(form.get('sheet') ?? '') || undefined
  if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Chọn file kế hoạch trước.' }, { status: 400 })
  if (!profiles.includes(profile as StagePlanProfile)) return NextResponse.json({ success: false, error: 'Profile kế hoạch không hợp lệ.' }, { status: 422 })
  const extension = profile === 'warping-work-order' ? ['.xlsb', '.xlsx'] : ['.xlsx']
  if (!extension.some(suffix => file.name.toLowerCase().endsWith(suffix))) return NextResponse.json({ success: false, error: `Profile này nhận file ${extension.join(' hoặc ')}.` }, { status: 422 })
  if (file.size > MAX_REPORT_UPLOAD_BYTES) return NextResponse.json({ success: false, error: 'File vượt giới hạn tải lên 4,4 MB của hệ thống. Hãy tách file theo kỳ/sheet rồi tải từng phần.' }, { status: 413 })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = parseStagePlanWorkbook(buffer, file.name, profile as StagePlanProfile, selectedSheet, Number(form.get('year')) || undefined, String(form.get('period') ?? '') || undefined)
    if (parsed.needsSheetSelection) return NextResponse.json({ success: false, error: 'Chọn sheet tháng trong file trước khi xác nhận.' }, { status: 422 })
    if (!parsed.rows.length || parsed.rows.length > MAX_ROWS) return NextResponse.json({ success: false, error: parsed.rows.length ? `Vượt giới hạn ${MAX_ROWS.toLocaleString('vi-VN')} dòng.` : 'File không có dòng kế hoạch phù hợp để nhập.' }, { status: 422 })
    const fileHash = createHash('sha256').update(buffer).digest('hex')
    const expectedSnapshot = snapshotHash({ fileHash, profile: parsed.profile, scopeKey: parsed.scopeKey, rows: parsed.rows })
    if (String(form.get('expectedSnapshot') ?? '') !== expectedSnapshot) return NextResponse.json({ success: false, error: 'File hoặc lựa chọn sheet đã thay đổi; hãy phân tích lại.' }, { status: 409 })

    try {
      const result = await prisma.$transaction(async tx => {
        const existing = await tx.productionStagePlanImportBatch.findUnique({
          where: { fileHash_profile_scopeKey: { fileHash, profile: parsed.profile, scopeKey: parsed.scopeKey } },
          select: { id: true, stage: true, profile: true, scopeKey: true, fileName: true, status: true, createdAt: true, rows: { select: { id: true } } },
        })
        if (existing) return { existing: true as const, batch: existing }
        const batch = await tx.productionStagePlanImportBatch.create({ data: {
          stage: parsed.stage, profile: parsed.profile, scopeKey: parsed.scopeKey, fileName: file.name, fileHash,
          status: 'CONFIRMED', summary: jsonInput({ rows: parsed.rows.length, warnings: parsed.warnings, sourceSheets: parsed.sourceSheets }), confirmedAt: new Date(),
        } })
        const batchSize = 5000
        for (let index = 0; index < parsed.rows.length; index += batchSize) {
          const rows = parsed.rows.slice(index, index + batchSize)
          await tx.productionStagePlanImportRow.createMany({ data: rows.map(row => ({
            batchId: batch.id, sourceKey: row.sourceKey, sourceSheet: row.sourceSheet, sourceRow: row.sourceRow,
            planDate: row.planDate ? new Date(`${row.planDate}T00:00:00.000Z`) : null,
            machineLabel: row.machineLabel, orderRef: row.orderRef, displayData: jsonInput(row.displayData), warnings: jsonInput(row.warnings),
          })) })
        }
        return { existing: false as const, batch: { ...batch, rows: parsed.rows.map(row => ({ id: row.sourceKey })) } }
      }, { timeout: 60_000, maxWait: 5_000 })
      return NextResponse.json({ success: true, existing: result.existing, batch: { ...result.batch, createdAt: result.batch.createdAt.toISOString(), rowCount: result.batch.rows.length } }, { status: result.existing ? 200 : 201 })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002') {
        const existing = await prisma.productionStagePlanImportBatch.findUnique({
          where: { fileHash_profile_scopeKey: { fileHash, profile: parsed.profile, scopeKey: parsed.scopeKey } },
          select: { id: true, stage: true, profile: true, scopeKey: true, fileName: true, status: true, createdAt: true, rows: { select: { id: true } } },
        })
        if (existing) return NextResponse.json({ success: true, existing: true, batch: { ...existing, createdAt: existing.createdAt.toISOString(), rowCount: existing.rows.length } })
      }
      throw error
    }
  } catch (error) {
    console.error('[POST /api/schedule/plan-import/confirm]', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Không lưu được kế hoạch.' }, { status: 500 })
  }
}
