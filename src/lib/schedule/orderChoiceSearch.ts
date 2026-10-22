import type { OrderStatus } from '@/lib/orderStatus'
import { lineLabel } from './piDisplay'

export type OrderChoice = {
  piNumber: string
  subLineIndex: number
  customer: string
  color: string | null
  meshType: string | null
  widthM: unknown
  gsm: unknown
  calculatedStatus: OrderStatus
  isDraft?: boolean
  isPlaceholder?: boolean
  lifecycleStatus?: string
}

export function formatOrderLabel(o: OrderChoice): string {
  const widthStr = o.widthM != null ? `${Number(o.widthM).toFixed(1)}m` : '—'
  const colorStr = o.color ?? '—'
  const gsmStr = o.gsm != null ? `${o.gsm}gsm` : '—'
  const isDraft = o.lifecycleStatus === 'DRAFT' || (o.isDraft && o.lifecycleStatus !== 'PLACEHOLDER' && !o.isPlaceholder)
  const isPlaceholder = o.lifecycleStatus === 'PLACEHOLDER' || o.isPlaceholder
  const tag = isDraft ? '[Nháp] ' : isPlaceholder ? '[Giữ chỗ] ' : ''
  const base = `${tag}${o.piNumber} · Dòng ${lineLabel(o)}${o.calculatedStatus === 'DONE' ? ' · Hoàn thành' : ''} — ${widthStr} · ${colorStr} · ${gsmStr}`
  return o.meshType ? `${base} · ${o.meshType}` : base
}

// R-3: ô tìm đơn khi dòng được chọn thay đổi.
// - có dòng chọn -> hiện nhãn dòng đó;
// - dòng chọn bị bỏ (cha đặt lại khi mở hộp) và ô vẫn đang chứa đúng nhãn dòng cũ -> xoá ô;
// - người dùng gõ chữ -> ô đã khác nhãn cũ nên giữ chữ đang gõ.
export function queryAfterSelection(query: string, selected: OrderChoice | undefined, previous: OrderChoice | undefined): string {
  if (selected) return formatOrderLabel(selected)
  return previous && query === formatOrderLabel(previous) ? '' : query
}

const groups: Record<OrderStatus, string> = {
  RUNNING: 'Đang sản xuất',
  PENDING: 'Chưa lên lịch',
  SCHEDULED: 'Đã lên lịch',
  DONE: 'Hoàn thành',
}
const rank: Record<OrderStatus, number> = { RUNNING: 0, PENDING: 1, SCHEDULED: 2, DONE: 3 }

function normalize(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/(\d),(?=\d)/g, '$1.')
}

export function searchOrderChoices<T extends OrderChoice>(orders: readonly T[], query: string): (T & { group: string })[] {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean)
  return orders
    .filter(o => {
      const searchable = normalize([formatOrderLabel(o), o.customer, o.widthM, o.gsm].join(' '))
      return terms.every(term => searchable.includes(term))
    })
    .slice()
    .sort((a, b) => rank[a.calculatedStatus] - rank[b.calculatedStatus] ||
      a.piNumber.localeCompare(b.piNumber, undefined, { numeric: true }) || a.subLineIndex - b.subLineIndex)
    .map(o => ({ ...o, group: groups[o.calculatedStatus] }))
}
