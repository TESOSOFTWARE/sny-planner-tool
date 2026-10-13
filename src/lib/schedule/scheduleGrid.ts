// Bố cục lưới lịch: cột máy và menu bấm ngày (0810-22b G1/G2).

// Một hằng số cho cột máy: dùng cho <col>, bề rộng bảng, và left của nhãn dính trên thanh phân công.
export const MACHINE_COL_WIDTH = 104

export type DayKind = 'HOLIDAY' | 'CLOSURE' | 'MAKEUP'
export type DayMenuItem = { label: string; kind: DayKind | null }

// Menu theo ngữ cảnh, tối đa 2 mục. kind = null nghĩa là bỏ đánh dấu tay.
export function dayMenuItems(restDay: boolean, exception: DayKind | null | undefined): DayMenuItem[] {
  if (exception) return [{ label: 'Bỏ đánh dấu (theo lịch tuần)', kind: null }]
  if (restDay) return [{ label: 'Cho đi làm (làm bù)', kind: 'MAKEUP' }]
  return [{ label: 'Cho nghỉ', kind: 'CLOSURE' }, { label: 'Đặt ngày lễ', kind: 'HOLIDAY' }]
}

// Tooltip khổ máy trên ô máy. state lấy từ trạng thái tải machine-specs.
export function machineSpecTooltip(state: 'loading' | 'ready' | 'error', widthM: number | undefined): string {
  if (state === 'error') return 'Khổ chưa tải được'
  if (state === 'loading') return 'Đang tải khổ...'
  if (widthM == null) return 'Khổ chưa có dữ liệu'
  return `Khổ máy: ${widthM.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`
}

// aria-label của ô máy để bàn phím và trình đọc màn hình nghe được khổ máy (0810-22c K1).
export function machineCellLabel(machine: string, state: 'loading' | 'ready' | 'error', widthM: number | undefined): string {
  return `${machine}, ${machineSpecTooltip(state, widthM)}`
}

type ContainsNode = { contains(node: unknown): boolean }

// Popup không có lớp nền: bấm trong panel hoặc trên nút mở thì không đóng; bấm ngoài thì đóng (0810-22c).
export function shouldDismiss(target: unknown, panel: ContainsNode | null | undefined, trigger: ContainsNode | null | undefined): boolean {
  if (!panel || panel.contains(target)) return false
  return !trigger?.contains(target)
}
