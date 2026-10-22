// [FB 22/10 ý 3] Nhóm quy cách = cùng PI + khổ + GSM + màu + loại lưới (trim, không phân biệt hoa thường; null chỉ khớp null).
// undefined = chưa nạp trường đó -> không bao giờ coi là cùng nhóm (an toàn: giữ luật chồng ngày cũ).
export type SpecOrder = { piNumber?: string; widthM?: unknown; gsm?: unknown; color?: string | null; meshType?: string | null }

const text = (v: string | null) => (v == null ? null : v.trim().toLowerCase())
const num = (v: unknown) => (v == null ? null : Number(v))

export function specKey(o: SpecOrder | null | undefined): string | null {
  if (!o || o.piNumber === undefined || o.widthM === undefined || o.gsm === undefined || o.color === undefined || o.meshType === undefined) return null
  return JSON.stringify([text(o.piNumber), num(o.widthM), num(o.gsm), text(o.color), text(o.meshType)])
}

export function sameSpecGroup(a: SpecOrder | null | undefined, b: SpecOrder | null | undefined): boolean {
  const key = specKey(a)
  return key !== null && key === specKey(b)
}

// ponytail: so khớp ở DB không trim được (Prisma); chỉ khác nhau do khoảng trắng đầu/cuối -> vẫn 409 (an toàn). Nâng lên findMany + sameSpecGroup khi có dữ liệu thật lệch khoảng trắng.
export function specWhere(o: SpecOrder | null | undefined) {
  if (specKey(o) === null) return null
  const str = (v: string | null | undefined) => (v == null ? null : { equals: v.trim(), mode: 'insensitive' as const })
  const order = { piNumber: str(o!.piNumber)!, widthM: num(o!.widthM), gsm: num(o!.gsm), color: str(o!.color), meshType: str(o!.meshType) }
  // R-1: SQL `NOT (a = x AND color ILIKE 'BLACK')` ra NULL (không phải TRUE) khi lịch kia có color NULL -> bị loại khỏi kiểm chồng.
  // Với mỗi trường nhóm có giá trị, buộc trường đó NOT NULL để phép so ra TRUE/FALSE rõ ràng. Trường nhóm = null thì `IS NULL` đã rõ ràng.
  const notNull = (['widthM', 'gsm', 'color', 'meshType'] as const).filter(key => order[key] !== null).map(key => ({ [key]: null }))
  return notNull.length ? { ...order, NOT: notNull } : order
}

// Dòng gợi ý xếp chung: cùng nhóm quy cách với dòng đã chọn, CHƯA có lịch nào. Dòng đã chọn cũng phải chưa có lịch.
// (Cùng PI nằm trong nhóm quy cách.) Trả theo thứ tự dòng hàng.
export function groupCandidates<T extends SpecOrder & { id: string; subLineIndex?: number; assignments?: unknown[] }>(orders: readonly T[], selected: T | null | undefined): T[] {
  if (!selected || (selected.assignments?.length ?? 0) > 0) return []
  return orders
    .filter(o => o.id !== selected.id && (o.assignments?.length ?? 0) === 0 && sameSpecGroup(o, selected))
    .slice()
    .sort((a, b) => (a.subLineIndex ?? 0) - (b.subLineIndex ?? 0))
}

export const roundMeters = (value: number) => Math.round(value * 100) / 100

// [FB 22/10 ý 3] Gộp lịch thành "nhóm" để vẽ 1 thanh: cùng máy + cùng nhóm quy cách + CÙNG ngày bắt đầu và kết thúc.
// Thiếu dữ liệu quy cách -> không gộp (mỗi lịch 1 nhóm). Thứ tự phần tử đầu = đại diện (dòng nhỏ nhất, rồi id).
type GroupableRow = { id: string; machineId: string; startDate: string | Date; endDate: string | Date; order: SpecOrder & { subLineIndex?: number } }

export function assignmentGroups<T extends GroupableRow>(rows: readonly T[], day: (value: string | Date) => string): T[][] {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const spec = specKey(row.order)
    const key = spec === null ? `solo:${row.id}` : JSON.stringify([row.machineId, day(row.startDate), day(row.endDate), spec])
    const list = groups.get(key) ?? []
    list.push(row); groups.set(key, list)
  }
  return Array.from(groups.values()).map(list => list.slice().sort((a, b) => (a.order.subLineIndex ?? 0) - (b.order.subLineIndex ?? 0) || a.id.localeCompare(b.id)))
}

// Chọn 1 lịch thuộc nhóm = chọn cả nhóm (ids của mọi thành viên cùng nhóm).
export function expandToGroups(ids: readonly string[], groups: readonly { id: string }[][]): string[] {
  const byId = new Map<string, string[]>()
  for (const group of groups) { const all = group.map(row => row.id); for (const row of group) byId.set(row.id, all) }
  return Array.from(new Set(ids.flatMap(id => byId.get(id) ?? [id])))
}
