import assert from 'node:assert/strict'
import test from 'node:test'
import { assertProductionImportAttempt, ProductionImportAttemptError, ProductionImportAttemptReplayError } from './importAttempt'

test('production writer locks the batch and refreshes attempt heartbeat before data writes', async () => {
  let locked = false, refreshed = false
  const tx = {
    $queryRaw: async () => { locked = true; return [] },
    productionReportImportSheet: {
      findUnique: async () => ({ status: 'PROCESSING', attemptToken: 'attempt-current' }),
      update: async ({ data }: { data: { updatedAt: Date } }) => { refreshed = data.updatedAt instanceof Date },
    },
  }
  await assertProductionImportAttempt(tx as never, { batchId: 'batch-1', sheet: 'EXTRUDER', token: 'attempt-current' })
  assert.equal(locked, true)
  assert.equal(refreshed, true)
})

test('production writer rejects a stale attempt token after reconciliation', async () => {
  const tx = {
    $queryRaw: async () => [],
    productionReportImportSheet: {
      findUnique: async () => ({ status: 'FAILED', attemptToken: null }),
      update: async () => { throw new Error('must not heartbeat invalid attempt') },
    },
  }
  await assert.rejects(
    assertProductionImportAttempt(tx as never, { batchId: 'batch-1', sheet: 'EXTRUDER', token: 'old-attempt' }),
    ProductionImportAttemptError,
  )
})

test('a repeated request with the same committed attempt returns the receipt instead of writing twice', async () => {
  const receipt = { recordsDeleted: 2, recordsInserted: 4 }
  const tx = {
    $queryRaw: async () => [],
    productionReportImportSheet: {
      findUnique: async () => ({ status: 'PROCESSING', attemptToken: 'attempt-current', attemptCommittedAt: new Date(), result: receipt }),
      update: async () => { throw new Error('committed retries must not write') },
    },
  }
  await assert.rejects(
    assertProductionImportAttempt(tx as never, { batchId: 'batch-1', sheet: 'EXTRUDER', token: 'attempt-current' }),
    error => error instanceof ProductionImportAttemptReplayError && JSON.stringify(error.receipt) === JSON.stringify(receipt),
  )
})
