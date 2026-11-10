import { z } from 'zod'

export const productionStages = ['extruder', 'warping', 'knitting', 'rolling', 'packing'] as const
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD.')
const common = {
  stage: z.enum(productionStages),
  date: day,
  machineId: z.string().trim().max(40).optional().or(z.literal('')),
  shift: z.enum(['D', 'N']).optional(),
  orderRef: z.string().trim().max(150).optional().or(z.literal('')),
  orderId: z.string().trim().min(1).max(40).optional().or(z.literal('')),
  color: z.string().trim().max(120).optional().or(z.literal('')),
  metricLabel: z.string().trim().min(1).max(80),
  unit: z.string().trim().min(1).max(24),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
}

export const manualProductionEntryInput = z.object({
  ...common,
  value: z.coerce.number().finite().min(0).max(9999999999.99),
})

export const productionPlanInput = z.object({
  ...common,
  value: z.coerce.number().finite().min(0).max(9999999999.99),
})

export const productionPlanUpdateInput = productionPlanInput.extend({
  expectedUpdatedAt: z.string().datetime(),
})

export function utcDay(value: string) {
  const [year, month, date] = value.split('-').map(Number)
  const result = new Date(Date.UTC(year, month - 1, date))
  return result.toISOString().slice(0, 10) === value ? result : null
}
