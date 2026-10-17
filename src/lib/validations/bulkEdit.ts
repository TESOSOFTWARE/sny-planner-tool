import { z } from 'zod'

const selection = z.array(z.object({ id: z.string().min(1).max(200), updatedAt: z.string().datetime({ offset: true }) }).strict()).min(1).max(500)
const commands = [
  z.object({ command: z.literal('MOVE_MACHINE'), targetMachineId: z.string().regex(/^M-0(0[1-9]|[1-3][0-9]|40)$/), assignments: selection }).strict(),
  z.object({ command: z.literal('SHIFT_DAYS'), workingDays: z.number().int().min(-60).max(60).refine(n => n !== 0), assignments: selection }).strict(),
] as const
export const bulkEditSchema = z.discriminatedUnion('command', commands)
  .refine(body => new Set(body.assignments.map(row => row.id)).size === body.assignments.length, 'Phân công trùng ID')
export const bulkEditCommitSchema = z.discriminatedUnion('command', [
  commands[0].extend({ planHash: z.string().regex(/^[a-f0-9]{64}$/) }),
  commands[1].extend({ planHash: z.string().regex(/^[a-f0-9]{64}$/) }),
]).refine(body => new Set(body.assignments.map(row => row.id)).size === body.assignments.length, 'Phân công trùng ID')
export type BulkEditBody = z.infer<typeof bulkEditSchema>
export type BulkEditCommand = { command: 'MOVE_MACHINE'; targetMachineId: string } | { command: 'SHIFT_DAYS'; workingDays: number }
