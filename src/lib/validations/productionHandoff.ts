import { z } from 'zod'
import { utcDay } from '@/lib/validations/productionEntry'

export const handoffInput = z.object({
  fromStage: z.enum(['extruder', 'warping', 'knitting', 'rolling']),
  quantity: z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'Số lượng tối đa 2 chữ số thập phân.'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD.'),
  shift: z.enum(['D', 'N']),
  handedOffBy: z.string().trim().min(1).max(100),
  receivedBy: z.string().trim().min(1).max(100),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
}).refine(value => {
  try { return Number(value.quantity) > 0 } catch { return false }
}, { path: ['quantity'], message: 'Số lượng bàn giao phải lớn hơn 0.' })
  .refine(value => utcDay(value.date) !== null, { path: ['date'], message: 'Ngày không hợp lệ.' })

export const handoffVoidInput = z.object({ reason: z.string().trim().min(1).max(500) })
