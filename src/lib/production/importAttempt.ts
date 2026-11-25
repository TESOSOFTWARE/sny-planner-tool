import type { Prisma } from '@prisma/client'
import type { StatisticalReportSheet } from './importReview'

type TransactionClient = Prisma.TransactionClient

export class ProductionImportAttemptError extends Error {
  constructor() {
    super('Lần import này đã hết hiệu lực hoặc được đối soát; dữ liệu chưa được ghi bởi yêu cầu cũ.')
    this.name = 'ProductionImportAttemptError'
  }
}

export class ProductionImportAttemptReplayError extends Error {
  constructor(readonly receipt: Record<string, unknown>) {
    super('Lần import này đã được ghi; trả lại kết quả đã lưu mà không chạy lại.')
    this.name = 'ProductionImportAttemptReplayError'
  }
}

/** Fence a workbook writer against stale tabs in the same transaction as its data changes. */
export async function assertProductionImportAttempt(
  tx: TransactionClient,
  attempt: { batchId: string; sheet: StatisticalReportSheet; token: string } | undefined,
) {
  if (!attempt) return
  await tx.$queryRaw`SELECT "id" FROM "production_report_import_batches" WHERE "id" = ${attempt.batchId} FOR UPDATE`
  const sheet = await tx.productionReportImportSheet.findUnique({
    where: { batchId_sheetName: { batchId: attempt.batchId, sheetName: attempt.sheet } },
    select: { status: true, attemptToken: true, attemptCommittedAt: true, result: true },
  })
  if (sheet?.attemptToken === attempt.token && sheet.attemptCommittedAt) {
    const receipt = sheet.result && typeof sheet.result === 'object' && !Array.isArray(sheet.result) ? sheet.result as Record<string, unknown> : {}
    throw new ProductionImportAttemptReplayError(receipt)
  }
  if (!sheet || sheet.status !== 'PROCESSING' || !sheet.attemptToken || sheet.attemptToken !== attempt.token) throw new ProductionImportAttemptError()
  // This heartbeat makes a concurrent manual reconciliation wait, then see that
  // a writer entered its transaction recently before it can invalidate the token.
  await tx.productionReportImportSheet.update({
    where: { batchId_sheetName: { batchId: attempt.batchId, sheetName: attempt.sheet } },
    data: { updatedAt: new Date() },
  })
}

export async function markProductionImportAttemptCommitted(
  tx: TransactionClient,
  attempt: { batchId: string; sheet: StatisticalReportSheet; token: string } | undefined,
  receipt: Record<string, unknown>,
) {
  if (!attempt) return
  await tx.productionReportImportSheet.update({
    where: { batchId_sheetName: { batchId: attempt.batchId, sheetName: attempt.sheet } },
    data: { attemptCommittedAt: new Date(), result: JSON.parse(JSON.stringify(receipt)) as Prisma.InputJsonValue },
  })
}
