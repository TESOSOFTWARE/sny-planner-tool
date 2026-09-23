// src/lib/validations/order.ts
// Zod v4 validation schema for creating a new ProductionOrder.
// Used on BOTH client (react-hook-form resolver) and server (API route).

import { z } from 'zod'

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
}

const isoDateSchema = (message: string) => z.string().refine(isValidISODate, message)

export const createOrderSchema = z.object({
  // ── Required fields ────────────────────────────────────────────────────────
  piNumber: z
    .string()
    .min(1, 'PI Number is required')
    .max(50, 'PI Number must be 50 characters or fewer')
    .transform((v) => v.trim()),

  subLineIndex: z
    .number()
    .int('Sub-line must be a whole number')
    .min(0, 'Sub-line must be 0 or greater')
    .default(1),

  customer: z
    .string()
    .min(1, 'Customer is required')
    .max(100, 'Customer must be 100 characters or fewer')
    .transform((v) => v.trim()),

  customerId: z.string().nullable().optional(),

  orderDate: z
    .string()
    .min(1, 'Order date is required')
    .refine(isValidISODate, 'Order date must be a valid date (YYYY-MM-DD)'),

  widthM: z
    .number().finite()
    .gt(0, 'Width must be greater than 0')
    .max(20, 'Width must be 20 m or less'),

  lengthM: z
    .number().finite()
    .gt(0, 'Length must be greater than 0')
    .max(100_000, 'Length must be 100,000 m or less'),

  gsm: z
    .number().finite()
    .int('GSM must be a whole number')
    .gt(0, 'GSM must be greater than 0')
    .max(500, 'GSM must be 500 or less'),

  productionGsm: z
    .number().finite()
    .int('GSM sản xuất must be a whole number')
    .gt(0, 'GSM sản xuất must be greater than 0')
    .max(500, 'GSM sản xuất must be 500 or less')
    .nullable()
    .optional(),

  color: z
    .string()
    .min(1, 'Color is required')
    .max(50, 'Color must be 50 characters or fewer')
    .transform((v) => v.trim().toUpperCase()),

  // ── Optional fields ────────────────────────────────────────────────────────
  qty: z
    .number().finite()
    .int('Quantity must be a whole number')
    .gt(0, 'Quantity must be greater than 0')
    .nullable()
    .optional(),

  uvPct: z
    .number().finite()
    .min(0, 'UV% must be between 0 and 100')
    .max(100, 'UV% must be between 0 and 100')
    .nullable()
    .optional(),

  frFlag: z.boolean().default(false),
  frPct: z.number().finite().min(0, 'FR% must be between 0 and 100').max(100, 'FR% must be between 0 and 100').nullable().optional(),

  description: z
    .string()
    .max(200, 'Description must be 200 characters or fewer')
    .transform((v) => v.trim())
    .nullable()
    .optional(),

  remark: z
    .string()
    .max(200, 'Remark must be 200 characters or fewer')
    .transform((v) => v.trim())
    .nullable()
    .optional(),

  lineNote: z
    .string()
    .max(200, 'Line note must be 200 characters or fewer')
    .transform((v) => v.trim())
    .nullable()
    .optional(),

  requiresPacking: z.boolean().default(false),
  deliveryDate: isoDateSchema('Delivery date must be a valid date (YYYY-MM-DD)').nullable().optional(),
  containerSize: z.string().max(50, 'Container size must be 50 characters or fewer').transform((v) => v.trim()).nullable().optional(),

  // Technical specs
  meshType: z
    .string()
    .max(100, 'Thể loại lưới must be 100 characters or fewer')
    .transform((v) => v.trim())
    .nullable()
    .optional(),

  needleCount: z
    .number().finite()
    .int('Số kim must be a whole number')
    .positive('Số kim must be positive')
    .nullable()
    .optional(),

  beamCount: z
    .number().finite()
    .int('Số dàn must be a whole number')
    .positive('Số dàn must be positive')
    .nullable()
    .optional(),

  // Mã Masterbatch màu (optional)
  mbCode: z
    .string()
    .max(50, 'MB Code must be 50 characters or fewer')
    .transform((v) => v.trim())
    .nullable()
    .optional(),

  // Kiểu đơn hàng
  orderType: z.enum(['meters', 'rolls', 'pieces']).default('meters'),
  rollLength: z.number().finite().positive('Số mét/cuộn phải lớn hơn 0').nullable().optional(),
  pieceLength: z.number().finite().positive('Chiều dài tấm phải lớn hơn 0').nullable().optional(),

  // Eyelet
  hasEyelet: z.boolean().default(false),
  eyeletColor: z.string().max(50, 'Eyelet color must be 50 characters or fewer').nullable().optional(),
  eyeletLines: z.number().int('Số lines eyelet phải là số nguyên').positive('Số lines eyelet phải > 0').nullable().optional(),
  eyeletSpec: z.string().max(200, 'Eyelet spec must be 200 characters or fewer').nullable().optional(),
})

export type CreateOrderInput = z.input<typeof createOrderSchema>

/** TypeScript type after Zod transforms (e.g. trim, toUpperCase applied). */
export type CreateOrderOutput = z.output<typeof createOrderSchema>

// ── Update schema (PATCH) ──────────────────────────────────────────────────
// All fields optional — allows partial updates. Same validation rules as create.

export const updateOrderSchema = z.object({
  // Optimistic concurrency token from the detail page. It is checked by the
  // PATCH route and never persisted as an order field.
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  piNumber: z
    .string()
    .min(1, 'PI Number is required')
    .max(50, 'PI Number must be 50 characters or fewer')
    .transform((v) => v.trim())
    .optional(),

  subLineIndex: z
    .number()
    .int('Sub-line must be a whole number')
    .min(0, 'Sub-line must be 0 or greater')
    .optional(),

  customer: z
    .string()
    .min(1, 'Customer is required')
    .max(100, 'Customer must be 100 characters or fewer')
    .transform((v) => v.trim())
    .optional(),

  customerId: z.string().nullable().optional(),

  orderDate: z
    .string()
    .refine(isValidISODate, 'Order date must be a valid date (YYYY-MM-DD)')
    .optional(),

  widthM: z
    .number().finite()
    .gt(0, 'Width must be greater than 0')
    .max(20, 'Width must be 20 m or less')
    .nullable()
    .optional(),

  lengthM: z
    .number().finite()
    .gt(0, 'Length must be greater than 0')
    .max(100_000, 'Length must be 100,000 m or less')
    .nullable()
    .optional(),

  gsm: z
    .number().finite()
    .int('GSM must be a whole number')
    .gt(0, 'GSM must be greater than 0')
    .max(500, 'GSM must be 500 or less')
    .nullable()
    .optional(),

  productionGsm: z
    .number().finite()
    .int('GSM sản xuất must be a whole number')
    .gt(0, 'GSM sản xuất must be greater than 0')
    .max(500, 'GSM sản xuất must be 500 or less')
    .nullable()
    .optional(),

  color: z
    .string()
    .min(1, 'Color is required')
    .max(50, 'Color must be 50 characters or fewer')
    .transform((v) => v.trim().toUpperCase())
    .nullable()
    .optional(),

  qty: z
    .number().finite()
    .int('Quantity must be a whole number')
    .gt(0, 'Quantity must be greater than 0')
    .nullable()
    .optional(),

  uvPct: z
    .number().finite()
    .min(0, 'UV% must be between 0 and 100')
    .max(100, 'UV% must be between 0 and 100')
    .nullable()
    .optional(),

  frFlag: z.boolean().optional(),
  frPct: z.number().finite().min(0).max(100).nullable().optional(),

  description: z
    .string()
    .max(200, 'Description must be 200 characters or fewer')
    .transform((v) => v.trim())
    .nullable()
    .optional(),

  remark: z
    .string()
    .max(200, 'Remark must be 200 characters or fewer')
    .transform((v) => v.trim())
    .nullable()
    .optional(),

  lineNote: z.string().max(200).transform(v => v.trim()).nullable().optional(),
  requiresPacking: z.boolean().optional(),
  deliveryDate: isoDateSchema('Delivery date must be a valid date (YYYY-MM-DD)').nullable().optional(),
  containerSize: z.string().max(50).transform(v => v.trim()).nullable().optional(),

  // Technical specs
  meshType: z
    .string()
    .max(100, 'Thể loại lưới must be 100 characters or fewer')
    .transform((v) => v.trim())
    .nullable()
    .optional(),

  needleCount: z
    .number().finite()
    .int('Số kim must be a whole number')
    .positive('Số kim must be positive')
    .nullable()
    .optional(),

  beamCount: z
    .number().finite()
    .int('Số dàn must be a whole number')
    .positive('Số dàn must be positive')
    .nullable()
    .optional(),

  // Mã Masterbatch màu (optional)
  mbCode: z
    .string()
    .max(50, 'MB Code must be 50 characters or fewer')
    .transform((v) => v.trim())
    .nullable()
    .optional(),

  // Kiểu đơn hàng
  orderType: z.enum(['meters', 'rolls', 'pieces']).optional(),
  rollLength: z.number().finite().positive('Số mét/cuộn phải lớn hơn 0').nullable().optional(),
  pieceLength: z.number().finite().positive('Chiều dài tấm phải lớn hơn 0').nullable().optional(),

  // Eyelet
  hasEyelet: z.boolean().optional(),
  eyeletColor: z.string().max(50).nullable().optional(),
  eyeletLines: z.number().int().positive().nullable().optional(),
  eyeletSpec: z.string().max(200).nullable().optional(),
})

export type UpdateOrderInput = z.input<typeof updateOrderSchema>

/** Output type for PATCH (after transforms). */
export type UpdateOrderOutput = z.output<typeof updateOrderSchema>

// ── Excel import schema ──────────────────────────────────────────────────────
// Shared by the Excel parser and the confirm endpoint so preview and save use
// exactly the same rules.  The parser keeps invalid rows for the preview,
// while the endpoint rejects the same rows before writing to the database.
export const importedOrderRowSchema = z
  .object({
    piNumber:     z.string().min(1, 'PI Number là bắt buộc').max(50).transform((v) => v.trim()),
    subLineIndex: z.number().int().min(0),
    customer:     z.string().min(1, 'Khách hàng là bắt buộc').max(100).transform((v) => v.trim()),
    orderDate:    isoDateSchema('Ngày đặt không hợp lệ (YYYY-MM-DD)'),
    widthM:       z.number().finite().gt(0, 'Khổ m phải > 0').max(20),
    lengthM:      z.number().finite().gt(0).max(100_000).nullable().optional(),
    gsm:          z.number().finite().int().gt(0, 'GSM phải > 0').max(500),
    productionGsm: z.number().finite().int().gt(0).max(500).nullable().optional(),
    color:        z.string().min(1, 'Màu là bắt buộc').max(50).transform((v) => v.trim().toUpperCase()),
    orderType:    z.enum(['meters', 'rolls', 'pieces']).default('meters'),
    qty:          z.number().finite().int().gt(0).nullable().optional(),
    rollLength:   z.number().finite().gt(0).nullable().optional(),
    pieceLength:  z.number().finite().gt(0).nullable().optional(),
    uvPct:        z.number().finite().min(0).max(100).nullable().optional(),
    frFlag:       z.boolean().default(false),
    frPct:        z.number().finite().min(0).max(100).nullable().optional(),
    description:  z.string().max(200).nullable().optional().transform((v) => v?.trim() ?? null),
    remark:       z.string().max(200).nullable().optional().transform((v) => v?.trim() ?? null),
    mbCode:       z.string().max(50).nullable().optional().transform((v) => v?.trim() ?? null),
    meshType:     z.string().max(100).nullable().optional().transform((v) => v?.trim() ?? null),
    needleCount:  z.number().finite().int().positive().nullable().optional(),
    beamCount:    z.number().finite().int().positive().nullable().optional(),
    lineNote:     z.string().max(200).nullable().optional().transform((v) => v?.trim() ?? null),
    requiresPacking: z.boolean().default(false),
    deliveryDate: isoDateSchema('Ngày giao không hợp lệ (YYYY-MM-DD)').nullable().optional(),
    containerSize: z.string().max(50).nullable().optional().transform((v) => v?.trim() ?? null),
    hasEyelet:    z.boolean().default(false),
    eyeletColor:  z.string().max(50).nullable().optional().transform((v) => v?.trim() ?? null),
    eyeletLines:  z.number().int().positive().nullable().optional(),
    eyeletSpec:   z.string().max(200).nullable().optional().transform((v) => v?.trim() ?? null),
  })
  .refine(
    (data) => !data.frFlag || (data.frPct != null && data.frPct > 0),
    { message: 'FR% phải > 0 khi chọn chống cháy (FR)', path: ['frPct'] },
  )
  .refine(
    (data) => {
      const totalMeters = data.orderType === 'rolls'
        ? (data.qty != null && data.rollLength != null ? data.qty * data.rollLength : null)
        : data.orderType === 'pieces'
          ? (data.qty != null && data.pieceLength != null ? data.qty * data.pieceLength : null)
          : data.lengthM
      if (totalMeters != null && totalMeters > 100_000) return false
      if (data.orderType === 'meters') {
        return data.lengthM != null && data.lengthM > 0
      }
      if (data.orderType === 'rolls') {
        return data.qty != null && data.qty > 0 && data.rollLength != null && data.rollLength > 0
      }
      return data.qty != null && data.qty > 0 && data.pieceLength != null && data.pieceLength > 0
    },
    {
      message: 'Thiếu thông số chiều dài hoặc tổng mét vượt quá 100.000',
      path: ['lengthM'],
    },
  )

export const MAX_IMPORTED_ORDER_ROWS = 5000

export const importedOrderBodySchema = z.object({
  rows: z.array(importedOrderRowSchema).min(1).max(MAX_IMPORTED_ORDER_ROWS),
})

export type ImportedOrderInput = z.input<typeof importedOrderRowSchema>
export type ImportedOrderOutput = z.output<typeof importedOrderRowSchema>

export const approvedOrderStateSchema = importedOrderRowSchema

export const draftOrderStateSchema = z.object({
  piNumber: z.string().min(1).max(50).transform((v) => v.trim()),
  subLineIndex: z.number().finite().int().min(0),
  customer: z.string().min(1).max(100).transform((v) => v.trim()),
  orderDate: isoDateSchema('Ngày đặt không hợp lệ (YYYY-MM-DD)'),
  widthM: z.number().finite().gt(0).max(20).nullable().optional(),
  lengthM: z.number().finite().gt(0).max(100_000).nullable().optional(),
  gsm: z.number().finite().int().gt(0).max(500).nullable().optional(),
  productionGsm: z.number().finite().int().gt(0).max(500).nullable().optional(),
  color: z.string().min(1).max(50).transform((v) => v.trim().toUpperCase()).nullable().optional(),
  orderType: z.enum(['meters', 'rolls', 'pieces']).default('meters'),
  qty: z.number().finite().int().gt(0).nullable().optional(),
  rollLength: z.number().finite().gt(0).nullable().optional(),
  pieceLength: z.number().finite().gt(0).nullable().optional(),
  uvPct: z.number().finite().min(0).max(100).nullable().optional(),
  frFlag: z.boolean().default(false),
  frPct: z.number().finite().min(0).max(100).nullable().optional(),
  description: z.string().max(200).transform((v) => v.trim()).nullable().optional(),
  remark: z.string().max(200).transform((v) => v.trim()).nullable().optional(),
  mbCode: z.string().max(50).transform((v) => v.trim()).nullable().optional(),
  meshType: z.string().max(100).transform((v) => v.trim()).nullable().optional(),
  needleCount: z.number().finite().int().positive().nullable().optional(),
  beamCount: z.number().finite().int().positive().nullable().optional(),
  lineNote: z.string().max(200).transform((v) => v.trim()).nullable().optional(),
  requiresPacking: z.boolean().default(false),
  deliveryDate: isoDateSchema('Ngày giao không hợp lệ (YYYY-MM-DD)').nullable().optional(),
  containerSize: z.string().max(50).transform((v) => v.trim()).nullable().optional(),
  hasEyelet: z.boolean().default(false),
  eyeletColor: z.string().max(50).transform((v) => v.trim()).nullable().optional(),
  eyeletLines: z.number().finite().int().positive().nullable().optional(),
  eyeletSpec: z.string().max(200).transform((v) => v.trim()).nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.frFlag && (data.frPct == null || data.frPct <= 0)) {
    ctx.addIssue({ code: 'custom', path: ['frPct'], message: 'FR% phải > 0 khi chọn chống cháy (FR)' })
  }
  const totalMeters = data.orderType === 'rolls'
    ? data.qty != null && data.rollLength != null ? data.qty * data.rollLength : null
    : data.orderType === 'pieces'
      ? data.qty != null && data.pieceLength != null ? data.qty * data.pieceLength : null
      : data.lengthM
  if (totalMeters != null && totalMeters > 100_000) {
    ctx.addIssue({ code: 'custom', path: ['lengthM'], message: 'Tổng mét không được vượt quá 100.000' })
  }
})

// ── Multi-line order schema ────────────────────────────────────────────────────
// Used by /api/orders/multi-line POST and the MultiLineOrderForm component.
// Shared fields apply to ALL sub-lines; per-line fields are in the `lines` array.

export const lineSchema = z
  .object({
    color:       z.string().min(1, 'Màu là bắt buộc').max(50).transform((v) => v.trim().toUpperCase()),
    widthM:      z.number().finite().gt(0, 'Khổ phải lớn hơn 0').max(20),
    gsm:         z.number().finite().int().gt(0, 'GSM phải lớn hơn 0').max(500),
    productionGsm: z.number().finite().int().gt(0, 'GSM sản xuất phải lớn hơn 0').max(500).nullable().optional(),
    orderType:   z.enum(['meters', 'rolls', 'pieces']).default('meters'),
    lengthM:     z.number().finite().gt(0).max(100_000).nullable().optional(),
    qty:         z.number().finite().int().gt(0).nullable().optional(),
    rollLength:  z.number().finite().gt(0).nullable().optional(),
    pieceLength: z.number().finite().gt(0).nullable().optional(),
    uvPct:       z.number().finite().min(0).max(100).nullable().optional(),
    frFlag:      z.boolean().default(false),
    frPct:       z.number().finite().min(0, 'FR% phải từ 0 đến 100').max(100, 'FR% phải từ 0 đến 100').nullable().optional(),
    requiresPacking: z.boolean().default(false),
    lineNote:    z.string().max(200).transform(v => v.trim()).nullable().optional(),
    hasEyelet:   z.boolean().default(false),
    eyeletColor: z.string().max(50).nullable().optional(),
    mbCode:      z.string().max(50).transform((v) => v.trim()).nullable().optional(),
    meshType:    z.string().max(100).transform((v) => v.trim()).nullable().optional(),
    needleCount: z.number().finite().int().positive().nullable().optional(),
    beamCount:   z.number().finite().int().positive().nullable().optional(),
    eyeletLines: z.number().finite().int().positive().nullable().optional(),
    eyeletSpec:  z.string().max(200).nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.frFlag && (data.frPct == null || data.frPct <= 0)) {
        return false
      }
      return true
    },
    {
      message: 'FR% phải lớn hơn 0 khi chọn chống cháy (FR)',
      path: ['frPct'],
    }
  )
  .refine(
    (data) => {
      if (data.orderType === 'meters') {
        return data.lengthM != null && data.lengthM > 0
      }
      if (data.orderType === 'rolls') {
        return data.qty != null && data.qty > 0 && data.rollLength != null && data.rollLength > 0
      }
      if (data.orderType === 'pieces') {
        return data.qty != null && data.qty > 0 && data.pieceLength != null && data.pieceLength > 0
      }
      return true
    },
    {
      message: 'Thiếu thông số chiều dài (Tổng mét / Số cuộn & mét cuộn / Số tấm & chiều dài tấm)',
      path: ['lengthM'],
    }
  )
  .refine(
    (data) => {
      const totalMeters = data.orderType === 'rolls'
        ? data.qty != null && data.rollLength != null ? data.qty * data.rollLength : null
        : data.orderType === 'pieces'
          ? data.qty != null && data.pieceLength != null ? data.qty * data.pieceLength : null
          : data.lengthM
      return totalMeters == null || totalMeters <= 100_000
    },
    { message: 'Tổng mét không được vượt quá 100.000', path: ['lengthM'] },
  )

export const multiLineOrderSchema = z.object({
  // Shared fields — apply to all sub-lines
  piNumber:    z.string().min(1, 'PI Number là bắt buộc').max(50).transform((v) => v.trim()),
  customer:    z.string().min(1, 'Khách hàng là bắt buộc').max(100).transform((v) => v.trim()),
  customerId:  z.string().nullable().optional(),
  orderDate:   isoDateSchema('Ngày đặt hàng phải là ngày hợp lệ (YYYY-MM-DD)'),
  deliveryDate: isoDateSchema('Ngày giao phải là ngày hợp lệ (YYYY-MM-DD)').nullable().optional(),
  containerSize: z.string().max(50).transform(v => v.trim()).nullable().optional(),
  description: z.string().max(200).transform((v) => v.trim()).nullable().optional(),
  remark:      z.string().max(200).transform((v) => v.trim()).nullable().optional(),
  isDraft:     z.boolean().optional(),
  lines:       z.array(lineSchema).min(1, 'Cần ít nhất 1 dòng'),
})

export type MultiLineOrderInput  = z.input<typeof multiLineOrderSchema>
export type MultiLineOrderOutput = z.output<typeof multiLineOrderSchema>

// ── Draft multi-line order schema (Sprint F1) ──────────────────────────────────
// Used when isDraft === true. Requires ONLY piNumber and customer.
// All spec fields on lines are optional/nullable.

const draftLineSchema = z.object({
  color:       z.string().max(50).transform((v) => v.trim().toUpperCase()).nullable().optional(),
  widthM:      z.number().finite().gt(0).max(20).nullable().optional(),
  gsm:         z.number().finite().int().gt(0).max(500).nullable().optional(),
  productionGsm: z.number().finite().int().gt(0).max(500).nullable().optional(),
  orderType:   z.enum(['meters', 'rolls', 'pieces']).default('rolls'),
  lengthM:     z.number().finite().gt(0).max(100_000).nullable().optional(),
  qty:         z.number().finite().int().gt(0).nullable().optional(),
  rollLength:  z.number().finite().gt(0).nullable().optional(),
  pieceLength: z.number().finite().gt(0).nullable().optional(),
  uvPct:       z.number().finite().min(0).max(100).nullable().optional(),
  frFlag:      z.boolean().default(false),
  frPct:       z.number().finite().min(0).max(100).nullable().optional(),
  requiresPacking: z.boolean().default(false),
  lineNote:    z.string().max(200).transform(v => v.trim()).nullable().optional(),
  hasEyelet:   z.boolean().default(false),
  eyeletColor: z.string().max(50).nullable().optional(),
  mbCode:      z.string().max(50).transform((v) => v.trim()).nullable().optional(),
  meshType:    z.string().max(100).transform((v) => v.trim()).nullable().optional(),
  needleCount: z.number().finite().int().positive().nullable().optional(),
  beamCount:   z.number().finite().int().positive().nullable().optional(),
  eyeletLines: z.number().finite().int().positive().nullable().optional(),
  eyeletSpec:  z.string().max(200).nullable().optional(),
})

export const draftMultiLineOrderSchema = z.object({
  piNumber:    z.string().min(1, 'PI Number là bắt buộc').max(50).transform((v) => v.trim()),
  customer:    z.string().min(1, 'Khách hàng là bắt buộc').max(100).transform((v) => v.trim()),
  customerId:  z.string().nullable().optional(),
  orderDate:   z.string().transform(v => v.trim()).optional(),
  deliveryDate: z.string().nullable().optional(),
  containerSize: z.string().max(50).transform(v => v.trim()).nullable().optional(),
  description: z.string().max(200).transform((v) => v.trim()).nullable().optional(),
  remark:      z.string().max(200).transform((v) => v.trim()).nullable().optional(),
  isDraft:     z.boolean().default(true),
  lines:       z.array(draftLineSchema).min(1, 'Cần ít nhất 1 dòng'),
})
