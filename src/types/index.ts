// src/types/index.ts
// Shared TypeScript types for SNY Planner.
// ProductionOrder types are derived from the Prisma schema so they stay
// in sync automatically — no manual duplication of field definitions.

import type { Prisma } from '@prisma/client'

/**
 * Full ProductionOrder as returned by Prisma (Date objects for timestamps,
 * Prisma.Decimal for uvPct).
 * Use this type inside Server Components where native types are fine.
 */
export type ProductionOrder = Prisma.ProductionOrderGetPayload<object>

/**
 * Serialized version of ProductionOrder safe to pass from a Server Component
 * to a Client Component as props. All non-plain-object types are converted:
 *   - Date fields → ISO string
 *   - Prisma.Decimal (uvPct) → string | null  (Decimal serialises as string over JSON)
 */
export interface SerializedProductionOrder {
  id: string
  piNumber: string
  subLineIndex: number
  customer: string
  customerId: string | null
  orderDate: string

  widthM: number | null
  lengthM: number | null
  gsm: number | null
  productionGsm: number | null
  color: string | null
  mbCode: string | null

  isDraft: boolean

  qty: number | null
  uvPct: string | null
  frFlag: boolean
  frPct: string | null
  description: string | null
  remark: string | null
  lineNote: string | null
  requiresPacking: boolean
  deliveryDate: string | null
  containerSize: string | null

  meshType: string | null
  needleCount: number | null
  beamCount: number | null

  orderType: string
  rollLength: string | null
  pieceLength: string | null

  hasEyelet: boolean
  eyeletColor: string | null

  qtySqm: string | null
  totalWeightKgs: string | null
  requiredYarnKg: string | null

  status: string
  dataSource: string

  createdAt: string
  updatedAt: string

  eyeletLines: number | null
  eyeletSpec: string | null

  assignments?: {
    startDate: string
    endDate: string
  }[]
}

/**
 * A single row parsed from the ORDER_LIST Excel file.
 * Plain JSON-serializable — travels from server parser → client preview → server confirm.
 * All required fields are non-nullable after parsing; optional fields may be null.
 */
export interface ParsedOrder {
  piNumber: string
  subLineIndex: number
  customer: string
  orderDate: string        // YYYY-MM-DD
  widthM: number
  lengthM: number
  gsm: number
  color: string
  productionGsm?: number | null
  orderType?: 'meters' | 'rolls' | 'pieces'
  qty: number | null
  rollLength?: number | null
  pieceLength?: number | null
  uvPct: number | null     // stored as-is (0.02 = 2%)
  frFlag: boolean
  frPct?: number | null
  description: string | null
  remark: string | null
  mbCode?: string | null
  meshType?: string | null
  needleCount?: number | null
  beamCount?: number | null
  lineNote?: string | null
  requiresPacking?: boolean
  deliveryDate?: string | null
  containerSize?: string | null
  // Validation status fields for preview UI
  isValid?: boolean
  validationErrors?: string[]
}

export interface SerializedRollingMetric {
  id: String
  date: string
  orderRef: string | null
  orderId: string | null
  color: string | null
  widthM: number | null
  lengthM: number | null
  weightKgsOrder: string | null
  metricLabel: string
  metricValue: string | null
  dataSource: string
  createdAt: string
}

export interface SerializedPackingOutput {
  id: string
  date: string
  qtyDay: number | null
  totalMDay: string | null
  weightDay: string | null
  qtyNight: number | null
  totalMNight: string | null
  weightNight: string | null
  dataSource: string
  createdAt: string
}

