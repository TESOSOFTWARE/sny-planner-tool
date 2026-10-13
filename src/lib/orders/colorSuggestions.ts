// Gộp nguồn gợi ý cho ô Màu (UI-5, 13/10): màu mẫu của khách → màu đã dùng → màu công thức xưởng.
// Chỉ sắp xếp/lọc dữ liệu đã có; không tự suy ra màu hay thông số mới (nguyên tắc "2 nguồn").
import type { SuggestOption } from '@/components/ui/SuggestCombobox'
import type { FactoryColorPreset } from '@/lib/colors'

export interface CustomerColorPreset {
  id: string
  color: string
  mbCode?: string | null
  wale?: number | null
  eyeletLines?: number | null
}

export type ColorSuggestion =
  | { kind: 'customer'; preset: CustomerColorPreset }
  | { kind: 'used' }
  | { kind: 'factory'; preset: FactoryColorPreset }

export function buildColorOptions(args: {
  q: string
  customerName?: string
  customerPresets?: CustomerColorPreset[]
  used: string[]
  factory: FactoryColorPreset[]
}): SuggestOption<ColorSuggestion>[] {
  const lower = args.q.trim().toLowerCase()
  const upper = lower.toUpperCase()
  const customer = (args.customerPresets ?? []).filter(p => !lower || p.color.toLowerCase().includes(lower))
  const presetColors = new Set((args.customerPresets ?? []).map(p => p.color.toUpperCase()))
  const used = args.used.filter(v => !presetColors.has(v.toUpperCase()))
  const factory = args.factory.filter(p => !upper
    || p.color.includes(upper)
    || p.name.toUpperCase().includes(upper)
    || (p.mbCode?.toUpperCase().includes(upper) ?? false)
    || (p.tags?.some(t => t.includes(upper)) ?? false))
  const customerGroup = `Màu mẫu (${args.customerName?.trim() || 'khách'})`
  return [
    ...customer.map(preset => ({
      value: preset.color,
      hint: [preset.mbCode && `MB: ${preset.mbCode}`, preset.wale && `Kim: ${preset.wale}`, preset.eyeletLines && `Eyelet: ${preset.eyeletLines}L`].filter(Boolean).join(' · ') || undefined,
      group: customerGroup,
      data: { kind: 'customer' as const, preset },
    })),
    ...used.map(value => ({ value, group: 'Đã dùng', data: { kind: 'used' as const } })),
    ...factory.map(preset => ({
      value: preset.color, label: preset.name, hint: preset.subText, group: 'Màu công thức xưởng',
      data: { kind: 'factory' as const, preset },
    })),
  ]
}

/** Phiên bản màu khi gõ tay / chọn màu không mang version riêng: Desert Sand bắt buộc chọn A/B (mặc định A). */
export const defaultColorVersion = (color: string, current?: string | null) =>
  color.toUpperCase().includes('DESERT')
    ? (current === 'Version A' || current === 'Version B' ? current : 'Version A')
    : 'STD'
