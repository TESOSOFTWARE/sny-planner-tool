import { outputFallsWithinSchedule } from './importSafety'

export type Coverer = { orderId: string; machineId: string; startDate: Date; endDate: Date; allocatedMeters: unknown; order: { lengthM: number | null } }

// [FB 22/10 ý 3] Sản lượng máy/ngày chia cho các dòng có lịch trùm ngày đó theo (allocatedMeters ?? lengthM); mỗi dòng đếm 1 lần
// (lịch chồng của chính dòng sau khi sửa lịch không tính đôi). Tổng phần của mọi dòng luôn = 1 -> không nhân N lần.
export function dayShare(orderId: string, machineId: string, reportDate: Date, all: readonly Coverer[]): number {
  const weights = new Map<string, number>()
  for (const a of all) {
    if (a.machineId !== machineId || !outputFallsWithinSchedule(reportDate, a)) continue
    const w = Number(a.allocatedMeters ?? a.order.lengthM ?? 0)
    weights.set(a.orderId, Math.max(weights.get(a.orderId) ?? 0, Number.isFinite(w) ? w : 0))
  }
  if (!weights.has(orderId)) return 0
  const total = Array.from(weights.values()).reduce((s, w) => s + w, 0)
  return total > 0 ? weights.get(orderId)! / total : 1 / weights.size
}