import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'
import { STATISTICAL_REPORT_SHEETS } from '@/lib/production/importReview'
import { publicImportSheetResults } from '@/lib/production/importSummary'

const sheetSchema = z.enum(STATISTICAL_REPORT_SHEETS)
const jsonInput = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
const createSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  reportMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  selectedSheets: z.array(sheetSchema).length(STATISTICAL_REPORT_SHEETS.length),
  decisions: z.record(z.string(), z.unknown()).optional().default({}),
})

function summary(batch: { id: string; fileName: string; fileHash: string; decisionHash: string; reportMonth: string; selectedSheets: unknown; sheetResults: unknown; status: string; createdAt: Date; completedAt: Date | null; decisions?: unknown }, includeDecisions = false) {
  return {
    id: batch.id, fileName: batch.fileName, fileHash: batch.fileHash, decisionHash: batch.decisionHash,
    reportMonth: batch.reportMonth, selectedSheets: batch.selectedSheets,
    sheetResults: publicImportSheetResults(batch.sheetResults), status: batch.status,
    createdAt: batch.createdAt.toISOString(), completedAt: batch.completedAt?.toISOString() ?? null,
    ...(includeDecisions && batch.decisions !== undefined ? { decisions: batch.decisions } : {}),
  }
}

export async function GET(request: NextRequest) {
  const denied = await authError('GET', request, 'output.read')
  if (denied) return denied
  const month = request.nextUrl.searchParams.get('month')
  const rawOffset = Number(request.nextUrl.searchParams.get('offset') ?? 0)
  const rawLimit = Number(request.nextUrl.searchParams.get('limit') ?? 25)
  const cursorAtRaw = request.nextUrl.searchParams.get('cursorAt')
  const cursorId = request.nextUrl.searchParams.get('cursorId')
  const cursorAt = cursorAtRaw ? new Date(cursorAtRaw) : null
  const validCursor = Boolean(cursorAt && Number.isFinite(cursorAt.getTime()) && cursorId && cursorId.length <= 64)
  const offset = Number.isInteger(rawOffset) ? Math.max(0, rawOffset) : 0
  const limit = Number.isInteger(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 25
  try {
    const filters: Prisma.ProductionReportImportBatchWhereInput[] = []
    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) filters.push({ reportMonth: month })
    if (validCursor && cursorAt && cursorId) filters.push({ OR: [{ createdAt: { lt: cursorAt } }, { createdAt: cursorAt, id: { lt: cursorId } }] })
    const batches = await prisma.productionReportImportBatch.findMany({
      where: filters.length ? { AND: filters } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...(validCursor ? {} : { skip: offset }), take: limit + 1,
      select: { id: true, fileName: true, fileHash: true, decisionHash: true, reportMonth: true, selectedSheets: true, sheetResults: true, status: true, createdAt: true, completedAt: true },
    })
    const hasMore = batches.length > limit
    const visible = batches.slice(0, limit)
    const last = visible.at(-1)
    return NextResponse.json({ success: true, batches: visible.map(batch => summary(batch)), hasMore, nextOffset: offset + visible.length, nextCursor: last ? { createdAt: last.createdAt.toISOString(), id: last.id } : null })
  } catch {
    return NextResponse.json({ success: false, error: 'Không tải được lịch sử import báo cáo.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const outputDenied = await authError('POST', request, 'output.actual.import')
  if (outputDenied) return outputDenied
  const materialDenied = await authError('POST', request, 'materials.import.confirm')
  if (materialDenied) return materialDenied

  const body: unknown = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Thông tin phiên import không hợp lệ.' }, { status: 422 })
  const input = parsed.data
  const decisions = Object.fromEntries(Object.keys(input.decisions).sort().map(key => [key, input.decisions[key]]))
  const decisionHash = createHash('sha256').update(JSON.stringify(decisions)).digest('hex')
  const selected = new Set(input.selectedSheets)
  if (selected.size !== STATISTICAL_REPORT_SHEETS.length || STATISTICAL_REPORT_SHEETS.some(sheet => !selected.has(sheet))) {
    return NextResponse.json({ success: false, error: 'Phiên import phải chứa đúng 5 sheet đã chọn.' }, { status: 422 })
  }
  try {
    const prior = await prisma.productionReportImportBatch.findUnique({ where: { fileHash_reportMonth: { fileHash: input.fileHash, reportMonth: input.reportMonth } } })
    if (prior) return NextResponse.json({ success: true, existing: true, batch: summary(prior, true) })
    const sheetResults = Object.fromEntries(STATISTICAL_REPORT_SHEETS.map(sheet => [sheet, { status: 'PENDING' }]))
    const batch = await prisma.productionReportImportBatch.create({ data: {
      fileName: input.fileName, fileHash: input.fileHash, reportMonth: input.reportMonth,
      decisionHash, decisions: jsonInput(decisions), selectedSheets: input.selectedSheets, sheetResults: jsonInput(sheetResults), status: 'PREPARED',
    } })
    return NextResponse.json({ success: true, existing: false, batch: summary(batch, true) }, { status: 201 })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002') {
      try {
        const prior = await prisma.productionReportImportBatch.findUnique({ where: { fileHash_reportMonth: { fileHash: input.fileHash, reportMonth: input.reportMonth } } })
        if (prior) return NextResponse.json({ success: true, existing: true, batch: summary(prior, true) })
      } catch { /* Return the common response below. */ }
    }
    return NextResponse.json({ success: false, error: 'Không thể lưu phiên import; dữ liệu công đoạn chưa được xác nhận.' }, { status: 500 })
  }
}
