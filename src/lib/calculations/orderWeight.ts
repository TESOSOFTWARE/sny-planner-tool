// src/lib/calculations/orderWeight.ts
// Server + client safe — pure calculation, no Prisma imports.
// Implements Case A formula: qtySqm × gsm / 1000

export interface OrderWeightInput {
  orderType: string
  widthM?: number | null
  lengthM?: number | null
  gsm?: number | null
  productionGsm?: number | null
  qty?: number | null
  rollLength?: number | null
  pieceLength?: number | null
  // Dual-GSM cho hàng gia công tráng màng ngoài
  isLaminated?: boolean | null
  rawFabricGsm?: number | null
  coatingGsm?: number | null
  finishedGsm?: number | null
}

export interface OrderWeightResult {
  totalMeters: number | null
  qtySqm: number | null
  totalWeightKgs: number | null
  requiredYarnKg: number | null
}

/**
 * Tính diện tích và trọng lượng đơn hàng.
 * Nếu thiếu bất kỳ thông số bắt buộc nào (cho đơn nháp), trả về null cho tất cả giá trị.
 * Tuyệt đối KHÔNG trả về NaN.
 * 
 * Sprint I2:
 * - totalWeightKgs (Trọng lượng hiển thị PO) = (qtySqm × gsm) / 1000 — KHÔNG ĐỔI
 * - requiredYarnKg (Nhu cầu nguyên liệu sợi nội bộ) = (qtySqm × (productionGsm ?? gsm)) / 1000 × 1.05
 */
export function calculateOrderWeight(input: OrderWeightInput): OrderWeightResult {
  let totalMeters: number | null = null

  if (
    input.orderType === 'rolls' &&
    input.qty != null && input.qty > 0 &&
    input.rollLength != null && input.rollLength > 0
  ) {
    totalMeters = input.qty * Number(input.rollLength)
  } else if (
    input.orderType === 'pieces' &&
    input.qty != null && input.qty > 0 &&
    input.pieceLength != null && input.pieceLength > 0
  ) {
    totalMeters = input.qty * Number(input.pieceLength)
  } else if (input.orderType === 'meters' && input.lengthM != null && input.lengthM > 0) {
    totalMeters = input.lengthM
  }

  if (totalMeters == null || !Number.isFinite(totalMeters) || totalMeters <= 0 || totalMeters > 100_000) {
    return { totalMeters: null, qtySqm: null, totalWeightKgs: null, requiredYarnKg: null }
  }

  if (input.widthM == null || !Number.isFinite(input.widthM) || input.widthM <= 0 || input.widthM > 20) {
    return { totalMeters, qtySqm: null, totalWeightKgs: null, requiredYarnKg: null }
  }

  const qtySqm = input.widthM * totalMeters

  // Xác định GSM thương mại & GSM dệt mộc
  const commercialGsm = (input.isLaminated && input.finishedGsm && input.finishedGsm > 0)
    ? input.finishedGsm
    : input.gsm

  if (!Number.isFinite(qtySqm) || commercialGsm == null || !Number.isFinite(commercialGsm) || commercialGsm <= 0 || commercialGsm > 500) {
    return { totalMeters, qtySqm, totalWeightKgs: null, requiredYarnKg: null }
  }

  // 1. Trọng lượng hiển thị đơn hàng (totalWeightKgs) — dùng commercialGsm (thành phẩm giao khách)
  const totalWeightKgs = (qtySqm * commercialGsm) / 1000

  // 2. Nhu cầu nguyên liệu sợi nội bộ (requiredYarnKg):
  // Nếu là đơn tráng màng ngoài → dùng rawFabricGsm (dệt mộc 325) để tính kg sợi mộc
  // Nếu không → dùng productionGsm nếu có, fallback commercialGsm
  const effectiveYarnGsm = (input.isLaminated && input.rawFabricGsm && input.rawFabricGsm > 0)
    ? input.rawFabricGsm
    : ((input.productionGsm != null && input.productionGsm > 0) ? input.productionGsm : commercialGsm)
  const requiredYarnKg = ((qtySqm * effectiveYarnGsm) / 1000) * 1.05

  if (!Number.isFinite(totalWeightKgs) || !Number.isFinite(requiredYarnKg)) {
    return { totalMeters, qtySqm, totalWeightKgs: null, requiredYarnKg: null }
  }

  return { totalMeters, qtySqm, totalWeightKgs, requiredYarnKg }
}
