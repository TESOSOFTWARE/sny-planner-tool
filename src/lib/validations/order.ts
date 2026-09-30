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

/**
 * P0-3: Chuẩn hóa lifecycleStatus + isPlaceholder từ mọi entry point.
 * Ưu tiên: lifecycleStatus tường minh > isPlaceholder > isDraft > APPROVED.
 * Trước P0-3, 3 route (multi-line, [id] PATCH, POST) không ghi lifecycleStatus
 * → DB default('APPROVED') thắng → đơn nháp bị gắn nhãn APPROVED.
 */
export function resolveLifecycle(
  input: { lifecycleStatus?: string | null; isPlaceholder?: boolean | null; isDraft?: boolean | null },
): { lifecycleStatus: 'DRAFT' | 'PLACEHOLDER' | 'APPROVED'; isPlaceholder: boolean } {
  const explicit = input.lifecycleStatus
  if (explicit === 'DRAFT' || explicit === 'PLACEHOLDER' || explicit === 'APPROVED') {
    return { lifecycleStatus: explicit, isPlaceholder: explicit === 'PLACEHOLDER' }
  }
  if (input.isPlaceholder === true) return { lifecycleStatus: 'PLACEHOLDER', isPlaceholder: true }
  if (input.isDraft === true) return { lifecycleStatus: 'DRAFT', isPlaceholder: false }
  return { lifecycleStatus: 'APPROVED', isPlaceholder: false }
}

/**
 * Auto-derive orderType ('meters' | 'rolls' | 'pieces') from packingType / text.
 * Guarantees 100% backward math compatibility even if UI only displays packingType.
 */
export function deriveOrderTypeFromPacking(
  primaryPackingType?: string | null,
  currentOrderType?: string | null
): 'meters' | 'rolls' | 'pieces' {
  if (currentOrderType && ['meters', 'rolls', 'pieces'].includes(currentOrderType)) {
    return currentOrderType as 'meters' | 'rolls' | 'pieces'
  }
  if (!primaryPackingType) return 'rolls'
  const normalized = primaryPackingType.toUpperCase()
  if (normalized.includes('CARTON') || normalized.includes('THÙNG') || normalized.includes('PIECE')) return 'pieces'
  if (normalized.includes('BALE') || normalized.includes('KIỆN') || normalized.includes('METER')) return 'meters'
  return 'rolls'
}

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

  // Mã Masterbatch màu & Công thức v4
  mbCode: z
    .string()
    .max(50, 'MB Code must be 50 characters or fewer')
    .transform((v) => v.trim())
    .nullable()
    .optional(),
  colorVersion: z.string().max(50).nullable().optional(),
  colorRecipeSnapshot: z.string().nullable().optional(),

  // Lifecycle v4
  lifecycleStatus: z.enum(['DRAFT', 'PLACEHOLDER', 'APPROVED']).optional(),
  isPlaceholder: z.boolean().optional(),


  // Kiểu đơn hàng & Đóng gói v4
  orderType: z.enum(['meters', 'rolls', 'pieces']).default('meters'),
  rollLength: z.number().finite().positive('Số mét/cuộn phải lớn hơn 0').nullable().optional(),
  pieceLength: z.number().finite().positive('Chiều dài tấm phải lớn hơn 0').nullable().optional(),

  primaryPackingType: z.enum(['ROLL', 'BALE', 'CARTON']).default('ROLL'),
  hasPaperCore: z.boolean().default(false),
  isHalfFolded: z.boolean().default(false),
  outerWrapping: z.enum(['POLYBAG', 'TARPAULIN', 'NONE']).default('POLYBAG').nullable().optional(),
  piecesPerCarton: z.number().int('Số tấm/thùng phải là số nguyên').positive('Số tấm/thùng phải > 0').nullable().optional(),
  piecesPerBale: z.number().int('Số tấm/kiện phải là số nguyên').positive('Số tấm/kiện phải > 0').nullable().optional(),
  boxDimensions: z.string().max(100).nullable().optional(),
  onPallet: z.boolean().default(false),
  secondaryPackingType: z.enum(['NONE', 'WOOD_PALLET', 'IRON_PALLET', 'PLASTIC_PALLET']).default('NONE'),
  palletDimensions: z.string().max(100).nullable().optional(),
  itemsPerPallet: z.number().int('Số lượng/pallet phải là số nguyên').positive('Số lượng/pallet phải > 0').nullable().optional(),
  packingNote: z.string().max(200).nullable().optional(),

  // Dual-GSM & Tolerance
  isLaminated: z.boolean().default(false),
  rawFabricGsm: z.number().int().positive().nullable().optional(),
  coatingGsm: z.number().int().positive().nullable().optional(),
  finishedGsm: z.number().int().positive().nullable().optional(),
  toleranceQtyPct: z.number().positive().default(10.0).nullable().optional(),
  toleranceSpecPct: z.number().positive().default(5.0).nullable().optional(),

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

  // Mã Masterbatch màu & Công thức v4
  mbCode: z
    .string()
    .max(50, 'MB Code must be 50 characters or fewer')
    .transform((v) => v.trim())
    .nullable()
    .optional(),
  colorVersion: z.string().max(50).nullable().optional(),
  colorRecipeSnapshot: z.string().nullable().optional(),

  // Lifecycle v4
  lifecycleStatus: z.enum(['DRAFT', 'PLACEHOLDER', 'APPROVED']).optional(),
  isPlaceholder: z.boolean().optional(),

  // Kiểu đơn hàng & Đóng gói v4
  orderType: z.enum(['meters', 'rolls', 'pieces']).optional(),
  rollLength: z.number().finite().positive('Số mét/cuộn phải lớn hơn 0').nullable().optional(),
  pieceLength: z.number().finite().positive('Chiều dài tấm phải lớn hơn 0').nullable().optional(),

  primaryPackingType: z.enum(['ROLL', 'BALE', 'CARTON']).optional(),
  hasPaperCore: z.boolean().optional(),
  isHalfFolded: z.boolean().optional(),
  outerWrapping: z.enum(['POLYBAG', 'TARPAULIN', 'NONE']).optional(),
  piecesPerCarton: z.number().int().positive().nullable().optional(),
  piecesPerBale: z.number().int().positive().nullable().optional(),
  boxDimensions: z.string().max(100).nullable().optional(),
  onPallet: z.boolean().optional(),
  secondaryPackingType: z.enum(['NONE', 'WOOD_PALLET', 'IRON_PALLET', 'PLASTIC_PALLET']).optional(),
  palletDimensions: z.string().max(100).nullable().optional(),
  itemsPerPallet: z.number().int().positive().nullable().optional(),
  packingNote: z.string().max(200).nullable().optional(),

  // Dual-GSM & Tolerance
  isLaminated: z.boolean().optional(),
  rawFabricGsm: z.number().int().positive().nullable().optional(),
  coatingGsm: z.number().int().positive().nullable().optional(),
  finishedGsm: z.number().int().positive().nullable().optional(),
  toleranceQtyPct: z.number().positive().nullable().optional(),
  toleranceSpecPct: z.number().positive().nullable().optional(),

  // Eyelet
  hasEyelet: z.boolean().optional(),
  eyeletColor: z.string().max(50).nullable().optional(),
  eyeletLines: z.number().int().positive().nullable().optional(),
  eyeletSpec: z.string().max(200).nullable().optional(),
})
  // V4.1 conditional rules (mục 5 — OrderDetail đơn lẻ).
  // Partial-update: chỉ kiểm khi field điều khiển xuất hiện trong payload;
  // field vắng mặt nghĩa là "giữ giá trị cũ", PATCH merge với current ở route.
  .refine(
    (data) => data.primaryPackingType !== 'CARTON' || (data.piecesPerCarton != null && data.piecesPerCarton > 0),
    { message: 'Thiếu số tấm/thùng khi chọn đóng thùng Carton (piecesPerCarton > 0)', path: ['piecesPerCarton'] },
  )
  .refine(
    (data) => data.primaryPackingType !== 'BALE' || (data.piecesPerBale != null && data.piecesPerBale > 0),
    { message: 'Thiếu số tấm/kiện khi chọn đóng kiện nén BALE (piecesPerBale > 0)', path: ['piecesPerBale'] },
  )
  .refine(
    (data) => data.onPallet !== true || (data.palletDimensions != null && data.palletDimensions.trim().length > 0),
    { message: 'Thiếu kích thước Pallet khi chọn đóng trên Pallet', path: ['palletDimensions'] },
  )
  // G2: partial-update nên chỉ bắt khi loại pallet xuất hiện tường minh là NONE
  // (vắng mặt = giữ giá trị cũ trong DB). Form edit luôn gửi đủ nên vẫn chặn được.
  .refine(
    (data) => data.onPallet !== true || data.secondaryPackingType == null || data.secondaryPackingType !== 'NONE',
    { message: 'Chưa chọn loại Pallet (Gỗ/Nhựa/Sắt) khi đóng trên Pallet', path: ['secondaryPackingType'] },
  )
  .refine(
    (data) => data.isLaminated !== true || (data.rawFabricGsm != null && data.rawFabricGsm > 0 && data.finishedGsm != null && data.finishedGsm > 0),
    { message: 'Hàng tráng màng ngoài bắt buộc có GSM dệt mộc và GSM thành phẩm', path: ['rawFabricGsm'] },
  )
  // desertSandVersionIssue là const khai báo phía dưới — inline message để tránh TDZ lúc load module
  // (function desertSandVersionOk thì hoisted nên tham chiếu trực tiếp được).
  .refine(desertSandVersionOk, {
    message: 'Màu Desert Sand bắt buộc chọn tường minh Version A hoặc Version B (không tự gán)',
    path: ['colorVersion'],
  })

export type UpdateOrderInput = z.input<typeof updateOrderSchema>

/** Output type for PATCH (after transforms). */
export type UpdateOrderOutput = z.output<typeof updateOrderSchema>

// ── Excel import schema ──────────────────────────────────────────────────────
// Shared by the Excel parser and the confirm endpoint so preview and save use
// exactly the same rules.  The parser keeps invalid rows for the preview,
// while the endpoint rejects the same rows before writing to the database.
// R6 (feedback KH): màu Desert Sand bắt buộc chọn tường minh Version A hoặc
// Version B — hệ thống không được tự gán ngầm định (xuất sai màu bị phạt HĐ).
export function desertSandVersionOk(data: { color?: string | null; colorVersion?: string | null }): boolean {
  const color = (data.color || '').toUpperCase()
  if (color.includes('DESERT SAND')) {
    return data.colorVersion === 'Version A' || data.colorVersion === 'Version B'
  }
  return true
}

export const desertSandVersionIssue = {
  message: 'Màu Desert Sand bắt buộc chọn tường minh Version A hoặc Version B (không tự gán)',
  path: ['colorVersion'],
}

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
    colorVersion: z.string().max(50).nullable().optional().transform((v) => v?.trim() ?? null),
    colorRecipeSnapshot: z.string().nullable().optional(),

    lifecycleStatus: z.enum(['DRAFT', 'PLACEHOLDER', 'APPROVED']).default('APPROVED'),
    isPlaceholder: z.boolean().default(false),

    orderType:    z.enum(['meters', 'rolls', 'pieces']).default('meters'),
    qty:          z.number().finite().int().gt(0).nullable().optional(),
    rollLength:   z.number().finite().gt(0).nullable().optional(),
    pieceLength:  z.number().finite().gt(0).nullable().optional(),

    primaryPackingType: z.enum(['ROLL', 'BALE', 'CARTON']).default('ROLL'),
    hasPaperCore: z.boolean().default(false),
    isHalfFolded: z.boolean().default(false),
    piecesPerCarton: z.number().finite().int().positive().nullable().optional(),
    piecesPerBale: z.number().finite().int().positive().nullable().optional(),
    boxDimensions: z.string().max(100).nullable().optional().transform((v) => v?.trim() ?? null),
    onPallet:     z.boolean().default(false),
    secondaryPackingType: z.enum(['NONE', 'WOOD_PALLET', 'IRON_PALLET', 'PLASTIC_PALLET']).default('NONE'),
    palletDimensions: z.string().max(100).nullable().optional().transform((v) => v?.trim() ?? null),
    itemsPerPallet: z.number().finite().int().positive().nullable().optional(),
    packingNote:  z.string().max(200).nullable().optional().transform((v) => v?.trim() ?? null),
    // V4.1 (mục 5): PATCH đơn lẻ merge state qua schema này — thiếu field nào
    // zod sẽ strip field đó khiến updateData reset về default. Optional thuần
    // (không default) để hàng import cũ thiếu field vẫn parse y như trước.
    outerWrapping: z.enum(['POLYBAG', 'TARPAULIN', 'NONE']).nullable().optional(),
    isLaminated:  z.boolean().optional(),
    rawFabricGsm: z.number().finite().int().positive().nullable().optional(),
    coatingGsm:   z.number().finite().int().positive().nullable().optional(),
    finishedGsm:  z.number().finite().int().positive().nullable().optional(),
    toleranceQtyPct:  z.number().finite().positive().nullable().optional(),
    toleranceSpecPct: z.number().finite().positive().nullable().optional(),
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
  // G2: import từ Excel — ĐÓNG PALLET=YES mà LOẠI PALLET=NONE thì chặn ở preview.
  .refine(
    (data) => data.onPallet !== true || (data.secondaryPackingType != null && data.secondaryPackingType !== 'NONE'),
    { message: 'Chưa chọn loại Pallet (Gỗ/Nhựa/Sắt) khi đóng trên Pallet', path: ['secondaryPackingType'] },
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
  .refine(
    (data) => {
      if (data.primaryPackingType === 'CARTON') {
        return data.piecesPerCarton != null && data.piecesPerCarton > 0
      }
      return true
    },
    { message: 'Thiếu số tấm/thùng khi chọn đóng thùng Carton (piecesPerCarton > 0)', path: ['piecesPerCarton'] }
  )
  .refine(
    (data) => {
      if (data.primaryPackingType === 'BALE') {
        return data.piecesPerBale != null && data.piecesPerBale > 0
      }
      return true
    },
    { message: 'Thiếu số tấm/kiện khi chọn đóng kiện nén BALE (piecesPerBale > 0)', path: ['piecesPerBale'] }
  )
  .refine(
    (data) => {
      if (data.onPallet) {
        return data.palletDimensions != null && data.palletDimensions.trim().length > 0
      }
      return true
    },
    { message: 'Thiếu kích thước Pallet khi chọn đóng trên Pallet', path: ['palletDimensions'] }
  )
  .refine(
    (data) => {
      if (data.isLaminated) {
        return data.rawFabricGsm != null && data.rawFabricGsm > 0 && data.finishedGsm != null && data.finishedGsm > 0
      }
      return true
    },
    { message: 'Hàng tráng màng ngoài bắt buộc có GSM dệt mộc và GSM thành phẩm', path: ['rawFabricGsm'] }
  )
  .refine(desertSandVersionOk, desertSandVersionIssue)

export const MAX_IMPORTED_ORDER_ROWS = 5000

// P0-13: insert chunk size. One createMany = one multi-row INSERT, capped
// by the Postgres 65,535 bind-param limit. Create input has ~55 columns,
// so 500 rows ≈ 27,500 params (~42% of the limit — 2.4x safety margin).
// 1,000 rows (≈55,000 params, 84%) is too close to the ceiling.
export const IMPORT_INSERT_CHUNK_SIZE = 500

// Param budget guard for the chunk test: chunks must stay well under
// the Postgres limit even if columns are added later.
export const IMPORT_INSERT_PARAM_BUDGET = 60000

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
  colorVersion: z.string().max(50).nullable().optional().transform((v) => v?.trim() ?? null),
  colorRecipeSnapshot: z.string().nullable().optional(),

  lifecycleStatus: z.enum(['DRAFT', 'PLACEHOLDER', 'APPROVED']).default('DRAFT'),
  isPlaceholder: z.boolean().default(false),

  orderType: z.enum(['meters', 'rolls', 'pieces']).default('meters'),
  qty: z.number().finite().int().gt(0).nullable().optional(),
  rollLength: z.number().finite().gt(0).nullable().optional(),
  pieceLength: z.number().finite().gt(0).nullable().optional(),

  primaryPackingType: z.enum(['ROLL', 'BALE', 'CARTON']).default('ROLL'),
  hasPaperCore: z.boolean().default(false),
  isHalfFolded: z.boolean().default(false),
  piecesPerCarton: z.number().finite().int().positive().nullable().optional(),
  piecesPerBale: z.number().finite().int().positive().nullable().optional(),
  boxDimensions: z.string().max(100).nullable().optional().transform((v) => v?.trim() ?? null),
  onPallet: z.boolean().default(false),
  secondaryPackingType: z.enum(['NONE', 'WOOD_PALLET', 'IRON_PALLET', 'PLASTIC_PALLET']).default('NONE'),
  palletDimensions: z.string().max(100).nullable().optional().transform((v) => v?.trim() ?? null),
  itemsPerPallet: z.number().finite().int().positive().nullable().optional(),
  packingNote: z.string().max(200).nullable().optional().transform((v) => v?.trim() ?? null),

  // V4.1 (mục 5): giữ lại qua state-parse của đơn nháp — lý do như importedOrderRowSchema.
  outerWrapping: z.enum(['POLYBAG', 'TARPAULIN', 'NONE']).nullable().optional(),
  isLaminated: z.boolean().optional(),
  rawFabricGsm: z.number().finite().int().positive().nullable().optional(),
  coatingGsm: z.number().finite().int().positive().nullable().optional(),
  finishedGsm: z.number().finite().int().positive().nullable().optional(),
  toleranceQtyPct: z.number().finite().positive().nullable().optional(),
  toleranceSpecPct: z.number().finite().positive().nullable().optional(),

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

// (desertSandVersionOk and desertSandVersionIssue moved above importedOrderRowSchema)

export const lineSchema = z
  .object({
    color:       z.string().min(1, 'Màu là bắt buộc').max(50).transform((v) => v.trim().toUpperCase()),
    colorVersion: z.string().max(50).nullable().optional(),
    colorRecipeSnapshot: z.string().nullable().optional(),
    widthM:      z.number().finite().gt(0, 'Khổ phải lớn hơn 0').max(20),
    gsm:         z.number().finite().int().gt(0, 'GSM phải lớn hơn 0').max(500),
    productionGsm: z.number().finite().int().gt(0, 'GSM sản xuất phải lớn hơn 0').max(500).nullable().optional(),
    orderType:   z.enum(['meters', 'rolls', 'pieces']).default('meters'),
    lengthM:     z.number().finite().gt(0).max(100_000).nullable().optional(),
    qty:         z.number().finite().int().gt(0).nullable().optional(),
    rollLength:  z.number().finite().gt(0).nullable().optional(),
    pieceLength: z.number().finite().gt(0).nullable().optional(),

  primaryPackingType: z.enum(['ROLL', 'BALE', 'CARTON']).default('ROLL'),
  // Lõi giấy chỉ áp dụng cho ROLL. BALE/CARTON = false.
  hasPaperCore: z.boolean().default(false),
  isHalfFolded: z.boolean().default(false),
  outerWrapping: z.enum(['POLYBAG', 'TARPAULIN', 'NONE']).default('POLYBAG').nullable().optional(),
    piecesPerCarton: z.number().finite().int().positive().nullable().optional(),
    piecesPerBale: z.number().finite().int().positive().nullable().optional(),
    boxDimensions: z.string().max(100).nullable().optional(),
    onPallet:    z.boolean().default(false),
    secondaryPackingType: z.enum(['NONE', 'WOOD_PALLET', 'IRON_PALLET', 'PLASTIC_PALLET']).default('NONE'),
    palletDimensions: z.string().max(100).nullable().optional(),
    itemsPerPallet: z.number().finite().int().positive().nullable().optional(),
    packingNote: z.string().max(200).nullable().optional(),

    // Dual-GSM & Tolerance
    isLaminated: z.boolean().default(false),
    rawFabricGsm: z.number().finite().int().positive().nullable().optional(),
    coatingGsm: z.number().finite().int().positive().nullable().optional(),
    finishedGsm: z.number().finite().int().positive().nullable().optional(),
    toleranceQtyPct: z.number().finite().positive().default(10.0).nullable().optional(),
    toleranceSpecPct: z.number().finite().positive().default(5.0).nullable().optional(),

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
  .refine(
    (data) => {
      if (data.primaryPackingType === 'CARTON') {
        return data.piecesPerCarton != null && data.piecesPerCarton > 0
      }
      return true
    },
    { message: 'Thiếu số tấm/thùng khi chọn đóng thùng Carton (piecesPerCarton > 0)', path: ['piecesPerCarton'] }
  )
  .refine(
    (data) => {
      if (data.primaryPackingType === 'BALE') {
        return data.piecesPerBale != null && data.piecesPerBale > 0
      }
      return true
    },
    { message: 'Thiếu số tấm/kiện khi chọn đóng kiện nén BALE (piecesPerBale > 0)', path: ['piecesPerBale'] }
  )
  .refine(
    (data) => {
      if (data.onPallet) {
        return data.palletDimensions != null && data.palletDimensions.trim().length > 0
      }
      return true
    },
    { message: 'Thiếu kích thước Pallet khi chọn đóng trên Pallet', path: ['palletDimensions'] }
  )
  .refine(
    (data) => {
      if (data.onPallet) {
        return data.secondaryPackingType != null && data.secondaryPackingType !== 'NONE'
      }
      return true
    },
    { message: 'Chưa chọn loại Pallet (Gỗ/Nhựa/Sắt) khi đóng trên Pallet', path: ['secondaryPackingType'] }
  )
  .refine(
    (data) => {
      if (data.isLaminated) {
        return data.rawFabricGsm != null && data.rawFabricGsm > 0 && data.finishedGsm != null && data.finishedGsm > 0
      }
      return true
    },
    { message: 'Hàng tráng màng ngoài bắt buộc có GSM dệt mộc và GSM thành phẩm', path: ['rawFabricGsm'] }
  )
  .refine(desertSandVersionOk, desertSandVersionIssue)

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
  lifecycleStatus: z.enum(['DRAFT', 'PLACEHOLDER', 'APPROVED']).optional(),
  isPlaceholder: z.boolean().optional(),
  lines:       z.array(lineSchema).min(1, 'Cần ít nhất 1 dòng'),
})

export type MultiLineOrderInput  = z.input<typeof multiLineOrderSchema>
export type MultiLineOrderOutput = z.output<typeof multiLineOrderSchema>

// ── Draft multi-line order schema (Sprint F1) ──────────────────────────────────
// Used when isDraft === true. Requires ONLY piNumber and customer.
// All spec fields on lines are optional/nullable.

export const draftLineSchema = z.object({
  color:       z.string().max(50).transform((v) => v.trim().toUpperCase()).nullable().optional(),
  colorVersion: z.string().max(50).nullable().optional(),
  colorRecipeSnapshot: z.string().nullable().optional(),
  widthM:      z.number().finite().gt(0).max(20).nullable().optional(),
  gsm:         z.number().finite().int().gt(0).max(500).nullable().optional(),
  productionGsm: z.number().finite().int().gt(0).max(500).nullable().optional(),
  orderType:   z.enum(['meters', 'rolls', 'pieces']).default('rolls'),
  lengthM:     z.number().finite().gt(0).max(100_000).nullable().optional(),
  qty:         z.number().finite().int().gt(0).nullable().optional(),
  rollLength:  z.number().finite().gt(0).nullable().optional(),
  pieceLength: z.number().finite().gt(0).nullable().optional(),

  primaryPackingType: z.enum(['ROLL', 'BALE', 'CARTON']).default('ROLL'),
  hasPaperCore: z.boolean().default(false),
  isHalfFolded: z.boolean().default(false),
  outerWrapping: z.enum(['POLYBAG', 'TARPAULIN', 'NONE']).default('POLYBAG').nullable().optional(),
  piecesPerCarton: z.number().finite().int().positive().nullable().optional(),
  piecesPerBale: z.number().finite().int().positive().nullable().optional(),
  boxDimensions: z.string().max(100).nullable().optional(),
  onPallet:    z.boolean().default(false),
  secondaryPackingType: z.enum(['NONE', 'WOOD_PALLET', 'IRON_PALLET', 'PLASTIC_PALLET']).default('NONE'),
  palletDimensions: z.string().max(100).nullable().optional(),
  itemsPerPallet: z.number().finite().int().positive().nullable().optional(),
  packingNote: z.string().max(200).nullable().optional(),

  // Dual-GSM & Tolerance
  isLaminated: z.boolean().default(false),
  rawFabricGsm: z.number().finite().int().positive().nullable().optional(),
  coatingGsm: z.number().finite().int().positive().nullable().optional(),
  finishedGsm: z.number().finite().int().positive().nullable().optional(),
  toleranceQtyPct: z.number().finite().positive().default(10.0).nullable().optional(),
  toleranceSpecPct: z.number().finite().positive().default(5.0).nullable().optional(),

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
  .refine(
    (data) => {
      if (data.primaryPackingType === 'CARTON') {
        return data.piecesPerCarton != null && data.piecesPerCarton > 0
      }
      return true
    },
    { message: 'Thiếu số tấm/thùng khi chọn đóng thùng Carton (piecesPerCarton > 0)', path: ['piecesPerCarton'] }
  )
  .refine(
    (data) => {
      if (data.primaryPackingType === 'BALE') {
        return data.piecesPerBale != null && data.piecesPerBale > 0
      }
      return true
    },
    { message: 'Thiếu số tấm/kiện khi chọn đóng kiện nén BALE (piecesPerBale > 0)', path: ['piecesPerBale'] }
  )
  .refine(
    (data) => {
      if (data.onPallet) {
        return data.palletDimensions != null && data.palletDimensions.trim().length > 0
      }
      return true
    },
    { message: 'Thiếu kích thước Pallet khi chọn đóng trên Pallet', path: ['palletDimensions'] }
  )
  .refine(
    (data) => {
      if (data.onPallet) {
        return data.secondaryPackingType != null && data.secondaryPackingType !== 'NONE'
      }
      return true
    },
    { message: 'Chưa chọn loại Pallet (Gỗ/Nhựa/Sắt) khi đóng trên Pallet', path: ['secondaryPackingType'] }
  )
  .refine(
    (data) => {
      if (data.isLaminated) {
        return data.rawFabricGsm != null && data.rawFabricGsm > 0 && data.finishedGsm != null && data.finishedGsm > 0
      }
      return true
    },
    { message: 'Hàng tráng màng ngoài bắt buộc có GSM dệt mộc và GSM thành phẩm', path: ['rawFabricGsm'] }
  )
  .refine(desertSandVersionOk, desertSandVersionIssue)

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
  lifecycleStatus: z.enum(['DRAFT', 'PLACEHOLDER', 'APPROVED']).default('DRAFT'),
  isPlaceholder: z.boolean().default(false),
  lines:       z.array(draftLineSchema).min(1, 'Cần ít nhất 1 dòng'),
})
