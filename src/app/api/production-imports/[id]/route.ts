import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'
import { STATISTICAL_REPORT_SHEETS } from '@/lib/production/importReview'
import { publicImportResult, publicImportSheetResults } from '@/lib/production/importSummary'

const sheetSchema = z.enum(STATISTICAL_REPORT_SHEETS)
const jsonInput = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
const updateSchema = z.object({
  sheet: sheetSchema,
  state: z.enum(['PREPARED', 'PROCESSING', 'CONFIRMED', 'FAILED', 'UNCERTAIN', 'RECONCILE_CONFIRMED', 'RECONCILE_FAILED']),
  attemptToken: z.string().max(64).optional(),
  sourceRows: z.array(z.unknown()).max(20_000).optional(),
  result: z.record(z.string(), z.unknown()).optional().default({}),
})

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  const requestedSheet = request.nextUrl.searchParams.get('sheet')
  const parsedSheet = requestedSheet ? sheetSchema.safeParse(requestedSheet) : null
  if (requestedSheet && !parsedSheet?.success) return NextResponse.json({ success: false, error: 'Sheet không hợp lệ.' }, { status: 422 })
  const permission = parsedSheet?.success && parsedSheet.data === 'HDPE' ? 'materials.read' : 'output.read'
  const denied = await authError('GET', request, permission)
  if (denied) return denied
  try {
    const batch = await prisma.productionReportImportBatch.findUnique({ where: { id: context.params.id } })
    if (!batch) return NextResponse.json({ success: false, error: 'Không tìm thấy phiên import.' }, { status: 404 })
    const { decisions: _decisions, ...metadata } = batch
    const base = { ...metadata, sheetResults: publicImportSheetResults(batch.sheetResults), createdAt: batch.createdAt.toISOString(), updatedAt: batch.updatedAt.toISOString(), completedAt: batch.completedAt?.toISOString() ?? null }
    if (requestedSheet && parsedSheet?.success) {
      const sheet = await prisma.productionReportImportSheet.findUnique({ where: { batchId_sheetName: { batchId: batch.id, sheetName: parsedSheet.data } } })
      if (!sheet) return NextResponse.json({ success: false, error: 'Phiên import không có sheet này.' }, { status: 404 })
      const { attemptToken: _attemptToken, attemptCommittedAt: _attemptCommittedAt, ...snapshot } = sheet
      return NextResponse.json({ success: true, batch: base, sheet: { ...snapshot, result: parsedSheet.data === 'HDPE' ? sheet.result : publicImportResult(sheet.result), createdAt: sheet.createdAt.toISOString(), updatedAt: sheet.updatedAt.toISOString() } })
    }
    return NextResponse.json({ success: true, batch: base })
  } catch {
    return NextResponse.json({ success: false, error: 'Không tải được chi tiết phiên import.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  const denied = await authError('PATCH', request, 'output.actual.import')
  if (denied) return denied
  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Kết quả sheet không hợp lệ.' }, { status: 422 })
  if (parsed.data.sheet === 'HDPE') {
    const materialDenied = await authError('PATCH', request, 'materials.import.confirm')
    if (materialDenied) return materialDenied
  }
  try {
    const result = await prisma.$transaction(async tx => {
      // Serialize all sheet state transitions for a batch. This prevents two tabs
      // from claiming different sheets and racing the batch-level result summary.
      await tx.$queryRaw`SELECT "id" FROM "production_report_import_batches" WHERE "id" = ${context.params.id} FOR UPDATE`
      const batch = await tx.productionReportImportBatch.findUnique({ where: { id: context.params.id } })
      if (!batch) return { kind: 'missing' as const }
      const selected = Array.isArray(batch.selectedSheets) ? batch.selectedSheets as string[] : []
      if (!selected.includes(parsed.data.sheet)) return { kind: 'sheet' as const }
      const stored = await tx.productionReportImportSheet.findUnique({ where: { batchId_sheetName: { batchId: batch.id, sheetName: parsed.data.sheet } } })

      if (parsed.data.state === 'PREPARED') {
        if (!parsed.data.sourceRows) return { kind: 'rows' as const }
        const byteLength = Buffer.byteLength(JSON.stringify(parsed.data.sourceRows), 'utf8')
        if (byteLength > 3_800_000) return { kind: 'large' as const }
        if (stored && stored.status !== 'PREPARED' && stored.status !== 'FAILED') return { kind: 'state' as const }
        await tx.productionReportImportSheet.upsert({
          where: { batchId_sheetName: { batchId: batch.id, sheetName: parsed.data.sheet } },
          create: { batchId: batch.id, sheetName: parsed.data.sheet, sourceRows: jsonInput(parsed.data.sourceRows), status: 'PREPARED', result: jsonInput({}) },
          update: { sourceRows: jsonInput(parsed.data.sourceRows), status: 'PREPARED', result: jsonInput({}), attemptToken: null, attemptCommittedAt: null },
        })
      } else if (parsed.data.state === 'PROCESSING') {
        if (!stored) return { kind: 'rows' as const }
        if (stored.status !== 'PREPARED' && stored.status !== 'FAILED') return { kind: 'state' as const }
        const storedSheets = await tx.productionReportImportSheet.findMany({ where: { batchId: batch.id, sheetName: { in: selected } }, select: { sheetName: true } })
        if (selected.some(sheetName => !storedSheets.some((sheet: { sheetName: string }) => sheet.sheetName === sheetName))) return { kind: 'incomplete' as const }
        const activeSheet = await tx.productionReportImportSheet.findFirst({ where: { batchId: batch.id, status: 'PROCESSING', NOT: { sheetName: parsed.data.sheet } }, select: { id: true } })
        if (activeSheet) return { kind: 'state' as const }
        const attemptToken = randomUUID()
        await tx.productionReportImportSheet.update({ where: { id: stored.id }, data: { status: 'PROCESSING', attemptToken, attemptCommittedAt: null, result: jsonInput({}) } })
        parsed.data.attemptToken = attemptToken
      } else {
        if (!stored) return { kind: 'state' as const }
        if (parsed.data.state === 'RECONCILE_CONFIRMED' || parsed.data.state === 'RECONCILE_FAILED') {
          const staleMs = Date.now() - stored.updatedAt.getTime()
          if ((stored.status !== 'PROCESSING' && stored.status !== 'UNCERTAIN') || staleMs < 15 * 60 * 1000) return { kind: 'active' as const }
          if (parsed.data.state === 'RECONCILE_FAILED' && stored.attemptCommittedAt) return { kind: 'committed' as const }
          const resolvedState = parsed.data.state === 'RECONCILE_CONFIRMED' ? 'CONFIRMED' : 'FAILED'
          const resolution = parsed.data.state === 'RECONCILE_CONFIRMED' ? 'MANAGER_VERIFIED_WRITTEN' : 'MANAGER_VERIFIED_NOT_WRITTEN'
          const priorResult = stored.result && typeof stored.result === 'object' && !Array.isArray(stored.result) ? stored.result as Record<string, unknown> : {}
          parsed.data.result = { ...priorResult, ...parsed.data.result, reconciliation: resolution }
          await tx.productionReportImportSheet.update({ where: { id: stored.id }, data: { status: resolvedState, attemptToken: null, attemptCommittedAt: resolvedState === 'CONFIRMED' ? stored.attemptCommittedAt : null, result: jsonInput(parsed.data.result) } })
          parsed.data.state = resolvedState
          parsed.data.result = { ...parsed.data.result, reconciliation: resolution }
        } else {
          if (stored.status !== 'PROCESSING' || !parsed.data.attemptToken || stored.attemptToken !== parsed.data.attemptToken) return { kind: 'state' as const }
          if (parsed.data.state === 'CONFIRMED' && !stored.attemptCommittedAt) return { kind: 'state' as const }
          if (parsed.data.state === 'FAILED' && stored.attemptCommittedAt) return { kind: 'committed' as const }
          if (parsed.data.state === 'UNCERTAIN' && stored.attemptCommittedAt) {
            parsed.data.state = 'CONFIRMED'
            parsed.data.result = { ...parsed.data.result, message: 'Writer transaction đã commit; trạng thái xác nhận được phục hồi từ receipt.' }
          }
          const terminalCommitted = parsed.data.state === 'CONFIRMED' && Boolean(stored.attemptCommittedAt)
          const priorResult = stored.result && typeof stored.result === 'object' && !Array.isArray(stored.result) ? stored.result as Record<string, unknown> : {}
          parsed.data.result = { ...priorResult, ...parsed.data.result }
          await tx.productionReportImportSheet.update({ where: { id: stored.id }, data: { status: parsed.data.state, attemptToken: terminalCommitted ? stored.attemptToken : null, result: jsonInput(parsed.data.result) } })
        }
      }

      const sheetResults = batch.sheetResults && typeof batch.sheetResults === 'object' && !Array.isArray(batch.sheetResults)
        ? { ...(batch.sheetResults as Record<string, unknown>) }
        : {}
      const previous = sheetResults[parsed.data.sheet] && typeof sheetResults[parsed.data.sheet] === 'object'
        ? sheetResults[parsed.data.sheet] as Record<string, unknown>
        : {}
      sheetResults[parsed.data.sheet] = { ...previous, status: parsed.data.state, result: parsed.data.result, updatedAt: new Date().toISOString() }
      const statuses = selected.map(sheet => {
        const value = sheetResults[sheet]
        return value && typeof value === 'object' ? (value as Record<string, unknown>).status : 'PENDING'
      })
      const status = statuses.every(value => value === 'CONFIRMED') ? 'CONFIRMED'
        : statuses.some(value => value === 'PROCESSING') ? 'PROCESSING'
          : statuses.some(value => value === 'FAILED' || value === 'UNCERTAIN' || value === 'CONFIRMED') ? 'PARTIAL' : 'PREPARED'
      const updated = await tx.productionReportImportBatch.update({ where: { id: batch.id }, data: { sheetResults: jsonInput(sheetResults), status, completedAt: status === 'CONFIRMED' ? new Date() : null } })
      return { kind: 'updated' as const, attemptToken: parsed.data.state === 'PROCESSING' ? parsed.data.attemptToken : undefined, batch: { id: updated.id, status: updated.status, sheetResults: publicImportSheetResults(updated.sheetResults), completedAt: updated.completedAt?.toISOString() ?? null } }
    })
    if (result.kind === 'missing') return NextResponse.json({ success: false, error: 'Không tìm thấy phiên import.' }, { status: 404 })
    if (result.kind === 'sheet') return NextResponse.json({ success: false, error: 'Sheet không nằm trong phiên import.' }, { status: 422 })
    if (result.kind === 'rows') return NextResponse.json({ success: false, error: 'Cần lưu các dòng nguồn trước khi ghi kết quả sheet.' }, { status: 422 })
    if (result.kind === 'large') return NextResponse.json({ success: false, error: 'Snapshot sheet vượt giới hạn lưu lịch sử 3.8 MB.' }, { status: 413 })
    if (result.kind === 'incomplete') return NextResponse.json({ success: false, error: 'Cần lưu snapshot của đủ 5 sheet trước khi ghi dữ liệu công đoạn.' }, { status: 409 })
    if (result.kind === 'state') return NextResponse.json({ success: false, error: 'Sheet đã được xác nhận, đang được xử lý ở phiên khác hoặc cần đối soát; hệ thống không chạy lặp để tránh ghi đè.' }, { status: 409 })
    if (result.kind === 'active') return NextResponse.json({ success: false, error: 'Phiên ghi chưa treo đủ 15 phút để đối soát. Vui lòng chờ tiến trình hiện tại kết thúc rồi tải lại lịch sử.' }, { status: 409 })
    if (result.kind === 'committed') return NextResponse.json({ success: false, code: 'IMPORT_ALREADY_COMMITTED', error: 'Writer đã lưu receipt trong transaction; không thể đánh dấu là chưa ghi.' }, { status: 409 })
    const sheetResult = (result.batch.sheetResults as Record<string, { status?: string }> | null)?.[parsed.data.sheet]
    return NextResponse.json({ success: true, batch: result.batch, sheetStatus: sheetResult?.status, ...(result.attemptToken ? { attemptToken: result.attemptToken } : {}) })
  } catch {
    return NextResponse.json({ success: false, error: 'Không thể cập nhật trạng thái phiên import.' }, { status: 500 })
  }
}
