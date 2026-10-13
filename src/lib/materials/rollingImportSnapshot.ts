import { createHash } from 'node:crypto'
import type { RollingPeriod } from './rollingPeriod'

export function rollingImportSnapshot(buffer: Buffer, period: RollingPeriod): string {
  return createHash('sha256').update(JSON.stringify(period)).update(buffer).digest('hex')
}
