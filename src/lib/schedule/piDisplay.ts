import { calcOrderStatus } from '../orderStatus'
import { scheduleDay } from './importSafety'
import { calculateOrderWeight } from '../calculations/orderWeight'

export type MachineInterval = { id: string; machineId: string; startDate: string | Date; endDate: string | Date; allocatedMeters?: string | null }
export function machineIntervalLabel(row: MachineInterval, now: string | Date = new Date()): string {
  const status = calcOrderStatus([row], now)
  return status === 'RUNNING' ? 'Đang chạy' : status === 'SCHEDULED' ? 'Đã phân công' : 'Đã xong'
}
export function distinctMachineCount(rows: readonly MachineInterval[]): number { return new Set(rows.map(r => r.machineId)).size }
export type OrderSpec = {
  isDraft?: boolean
  orderType?: string | null
  widthM?: number | null
  lengthM?: number | null
  rollLength?: number | string | null
  pieceLength?: number | string | null
  qty?: number | null
}

type SpecOptions = { includeTotal?: boolean }

export function orderTotalMeters(order: OrderSpec): number | null {
  return calculateOrderWeight({
    orderType: order.orderType ?? 'meters',
    qty: order.qty,
    rollLength: order.rollLength == null ? null : Number(order.rollLength),
    pieceLength: order.pieceLength == null ? null : Number(order.pieceLength),
    lengthM: order.lengthM,
  }).totalMeters
}

export function formatOrderTotalMeters(order: OrderSpec): string {
  const total = orderTotalMeters(order)
  return total == null ? '—' : `${total.toLocaleString('vi-VN')} m`
}

function specValue(value: number | string | null | undefined): string {
  if (value == null || (typeof value === 'string' && !value.trim())) return ''
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toLocaleString('vi-VN') : ''
}

export function formatOrderSpec(order: OrderSpec, options: SpecOptions = {}): string {
  const value = (input: number | string | null | undefined) => order.isDraft && input != null && Number(input) === 0 ? '' : specValue(input)
  const width = value(order.widthM)
  if (order.orderType === 'rolls' || order.orderType === 'pieces') {
    const unitLength = value(order.orderType === 'rolls' ? order.rollLength : order.pieceLength)
    const dimensions = width && unitLength ? `${width} × ${unitLength} m` : width ? `${width} m` : unitLength ? `${unitLength} m` : ''
    const qty = value(order.qty)
    return [dimensions, qty ? `${qty} ${order.orderType === 'rolls' ? 'cuộn' : 'tấm'}` : ''].filter(Boolean).join(' · ')
  }
  const total = order.orderType === 'meters' && options.includeTotal !== false ? value(order.lengthM) : ''
  return [width ? `${width} m` : '', total ? `tổng ${total} m` : ''].filter(Boolean).join(' · ')
}

export function formatLineSpec(o: OrderSpec & { gsm?: number | null; color?: string | null; mbCode?: string | null }, options: SpecOptions = {}): string {
  const gsm = o.isDraft && o.gsm === 0 ? '' : specValue(o.gsm)
  return [gsm ? `${gsm}GSM` : '', [o.color, o.mbCode].filter(Boolean).join(' '), formatOrderSpec(o, options)].filter(Boolean).join(' · ')
}
export function piBlocks(cells: readonly ({order: {piNumber:string}} | undefined)[]) {
  const blocks: {from:number;to:number;piNumber:string|null}[]=[]
  cells.forEach((cell,index)=>{const piNumber=cell?.order.piNumber??null;const previous=blocks[blocks.length-1];if(previous&&previous.piNumber===piNumber)previous.to=index+1;else blocks.push({from:index+1,to:index+1,piNumber})})
  return blocks
}
export function savedIntervalRange(rows: readonly MachineInterval[]) {
  if(!rows.length)return null
  const from=rows.map(r=>scheduleDay(r.startDate)).sort()[0]
  const to=rows.map(r=>scheduleDay(r.endDate)).sort().at(-1)!
  return {from,to}
}

export function scheduleProductLabel(order: { meshType?: string | null; description?: string | null }): string {
  return order.meshType?.trim() || order.description?.trim() || ''
}

export const DISPLAY_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const
export function orderQuantityLabel(order: { orderType?: string | null; qty?: number | null }): string {
  if (order.qty == null) return '—'
  const qty = order.qty.toLocaleString('vi-VN')
  return order.orderType === 'rolls' ? `${qty} cuộn` : order.orderType === 'pieces' ? `${qty} tấm` : `${qty} (không dùng để tính — đơn tính theo tổng mét)`
}
export function hasUnusedOrderQuantity(order: { orderType?: string | null; qty?: number | null }): boolean {
  return (order.orderType == null || order.orderType === 'meters') && order.qty != null && order.qty > 0
}

export function lineLabel(order: { subLineIndex?: number | null; isPlaceholder?: boolean }): string {
  return order.isPlaceholder || order.subLineIndex == null ? '—' : String(order.subLineIndex)
}
