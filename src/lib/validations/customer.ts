import { z } from 'zod'

export const customerSchema = z.object({
  name: z.string().min(1, 'Tên khách hàng là bắt buộc').max(100, 'Tối đa 100 ký tự').transform(v => v.trim()),
  address: z.string().max(200, 'Tối đa 200 ký tự').transform(v => v.trim()).nullable().optional(),
  tel: z.string().max(50, 'Tối đa 50 ký tự').transform(v => v.trim()).nullable().optional(),
  fax: z.string().max(50, 'Tối đa 50 ký tự').transform(v => v.trim()).nullable().optional(),
  contact: z.string().max(100, 'Tối đa 100 ký tự').transform(v => v.trim()).nullable().optional(),
  country: z.string().max(50, 'Tối đa 50 ký tự').transform(v => v.trim()).nullable().optional(),
  note: z.string().max(500, 'Tối đa 500 ký tự').transform(v => v.trim()).nullable().optional(),
})

export type CustomerInput = z.infer<typeof customerSchema>

export const updateCustomerSchema = customerSchema.partial()
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>
