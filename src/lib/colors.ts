export type ColorStyle = {
  bgHex: string
  textHex: string
  borderHex: string
  bgClass: string
  textClass: string
  borderClass: string
}

export const PI_COLOR_PALETTE: ColorStyle[] = [
  { bgHex: '#d1fae5', textHex: '#065f46', borderHex: '#6ee7b7', bgClass: 'bg-emerald-100', textClass: 'text-emerald-900', borderClass: 'border-emerald-300' },
  { bgHex: '#dbeafe', textHex: '#1e40af', borderHex: '#93c5fd', bgClass: 'bg-blue-100', textClass: 'text-blue-900', borderClass: 'border-blue-300' },
  { bgHex: '#f3e8ff', textHex: '#6b21a8', borderHex: '#d8b4fe', bgClass: 'bg-purple-100', textClass: 'text-purple-900', borderClass: 'border-purple-300' },
  { bgHex: '#fef3c7', textHex: '#92400e', borderHex: '#fcd34d', bgClass: 'bg-amber-100', textClass: 'text-amber-950', borderClass: 'border-amber-300' },
  { bgHex: '#ffe4e6', textHex: '#9f1239', borderHex: '#fda4af', bgClass: 'bg-rose-100', textClass: 'text-rose-900', borderClass: 'border-rose-300' },
  { bgHex: '#e0e7ff', textHex: '#3730a3', borderHex: '#a5b4fc', bgClass: 'bg-indigo-100', textClass: 'text-indigo-900', borderClass: 'border-indigo-300' },
  { bgHex: '#ccfbf1', textHex: '#115e59', borderHex: '#5eead4', bgClass: 'bg-teal-100', textClass: 'text-teal-900', borderClass: 'border-teal-300' },
  { bgHex: '#cffafe', textHex: '#155e75', borderHex: '#67e8f9', bgClass: 'bg-cyan-100', textClass: 'text-cyan-900', borderClass: 'border-cyan-300' },
  { bgHex: '#e0f2fe', textHex: '#075985', borderHex: '#7dd3fc', bgClass: 'bg-sky-100', textClass: 'text-sky-900', borderClass: 'border-sky-300' },
  { bgHex: '#ede9fe', textHex: '#5b21b6', borderHex: '#c4b5fd', bgClass: 'bg-violet-100', textClass: 'text-violet-900', borderClass: 'border-violet-300' },
  { bgHex: '#fae8ff', textHex: '#86198f', borderHex: '#f0abfc', bgClass: 'bg-fuchsia-100', textClass: 'text-fuchsia-900', borderClass: 'border-fuchsia-300' },
  { bgHex: '#fce7f3', textHex: '#9d174d', borderHex: '#fbcfe8', bgClass: 'bg-pink-100', textClass: 'text-pink-900', borderClass: 'border-pink-300' },
  { bgHex: '#ffedd5', textHex: '#9a3412', borderHex: '#fdba74', bgClass: 'bg-orange-100', textClass: 'text-orange-950', borderClass: 'border-orange-300' },
  { bgHex: '#ecfccb', textHex: '#3f6212', borderHex: '#bef264', bgClass: 'bg-lime-100', textClass: 'text-lime-950', borderClass: 'border-lime-300' },
  { bgHex: '#fef9c3', textHex: '#854d0e', borderHex: '#fde047', bgClass: 'bg-yellow-100', textClass: 'text-yellow-950', borderClass: 'border-yellow-300' },
  { bgHex: '#e2e8f0', textHex: '#1e293b', borderHex: '#cbd5e1', bgClass: 'bg-slate-200', textClass: 'text-slate-900', borderClass: 'border-slate-300' },
]

/**
 * Deterministic color picker for a given piNumber string.
 * Always returns the exact same ColorStyle for identical piNumbers.
 */
export function getPiColorStyle(piNumber?: string | null): ColorStyle {
  if (!piNumber) return PI_COLOR_PALETTE[0]

  let hash = 0
  for (let i = 0; i < piNumber.length; i++) {
    hash = piNumber.charCodeAt(i) + ((hash << 5) - hash)
  }

  const index = Math.abs(hash) % PI_COLOR_PALETTE.length
  return PI_COLOR_PALETTE[index]
}

export interface FactoryColorPreset {
  name: string
  color: string
  version: string
  mbCode?: string
  subText: string
  tags?: string[]
}

/**
 * Danh mục Màu công thức xưởng tiêu chuẩn được đối chiếu từ:
 * - Kế hoạch đặt Masterbatch (kế hoạch đặt MB 2025.xlsx)
 * - Lịch sử đơn hàng xuất khẩu (ORDER LIST OFFICIAL 2023-2026.xlsx)
 * - Work Instructions (WI ALTAJ26-4, SEDCO26-2)
 */
export const FACTORY_COLOR_PRESETS: FactoryColorPreset[] = [
  {
    name: 'DESERT SAND (Bản A)',
    color: 'DESERT SAND',
    version: 'Version A',
    mbCode: '3160-2',
    subText: 'Hạt MB Korea 3160-2 · 3%',
    tags: ['SAND', 'BEIGE', 'DESERT', 'KOREA', 'A'],
  },
  {
    name: 'DESERT SAND (Bản B)',
    color: 'DESERT SAND',
    version: 'Version B',
    mbCode: '8005A',
    subText: 'Hạt Arirang 8005A · 3%',
    tags: ['SAND', 'BEIGE', 'DESERT', 'ARIRANG', 'B'],
  },
  {
    name: 'BLACK (Đen)',
    color: 'BLACK',
    version: 'STD',
    mbCode: 'B045',
    subText: 'Tiêu chuẩn B045 / IM-B045ANF',
    tags: ['BLACK', 'ĐEN', 'DEBRIS'],
  },
  {
    name: 'DARK GREEN (Xanh rêu)',
    color: 'DARK GREEN',
    version: 'STD',
    mbCode: 'G024',
    subText: 'Tiêu chuẩn G024 / 8086-2',
    tags: ['GREEN', 'XANH', 'RÊU', 'D.GREEN'],
  },
  {
    name: 'SNOW WHITE (Trắng tuyết)',
    color: 'SNOW WHITE',
    version: 'STD',
    mbCode: '1065',
    subText: 'Tiêu chuẩn 1065 / PE970N',
    tags: ['WHITE', 'TRẮNG', 'SNOW', 'SWHITE', 'S.WHITE'],
  },
  {
    name: 'BLUE (Xanh dương)',
    color: 'BLUE',
    version: 'STD',
    mbCode: '6087-1',
    subText: 'Pantone 287C / MBD-5007',
    tags: ['BLUE', 'XANH DƯƠNG', 'PANTONE 287C'],
  },
  {
    name: 'AQUA BLUE (Xanh biển)',
    color: 'AQUA BLUE',
    version: 'STD',
    mbCode: '6026-1',
    subText: 'Tiêu chuẩn 6026-1 / #293',
    tags: ['AQUA', 'BLUE', 'XANH BIỂN', '293'],
  },
  {
    name: 'BEIGE (Màu be)',
    color: 'BEIGE',
    version: 'STD',
    mbCode: '3233-5',
    subText: 'Tiêu chuẩn 3233-5 / 8005A',
    tags: ['BEIGE', 'BE', 'KEM', 'IVORY'],
  },
  {
    name: 'ORANGE (Cam cảnh báo)',
    color: 'ORANGE',
    version: 'STD',
    mbCode: '5066-3',
    subText: 'Tiêu chuẩn 5066-3 / MOD-2002',
    tags: ['ORANGE', 'CAM', 'PANTONE 021C'],
  },
  {
    name: 'STEEL GREY (Xám thép)',
    color: 'STEEL GREY',
    version: 'STD',
    mbCode: '2032-2',
    subText: 'Tiêu chuẩn 2032-2 / #421',
    tags: ['GREY', 'GRAY', 'XÁM', 'STEEL', '421'],
  },
]
