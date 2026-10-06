import type { ItemCodeOption } from './itemCodeCatalog'

export interface LineTargetForPrefill {
  color?: string | null
  colorVersion?: string | null
  uvPct?: string | number | null
  meshType?: string | null
  mbCode?: string | null
}

export interface ItemCodePrefillResult {
  patch: {
    color?: string
    colorVersion?: string
    uvPct?: string
    meshType?: string
    mbCode?: string
  }
  conflictWarning?: string
}

/**
 * Tính toán các trường cần điền ăn theo khi chọn một Item Code.
 * Tuân thủ quy tắc Fill-if-blank:
 * - Chỉ điền vào các trường đang để trống (color, uvPct, meshType, mbCode).
 * - Nếu trường đã có dữ liệu người dùng gõ từ trước -> giữ nguyên dữ liệu đó.
 * - Phát hiện xung đột màu nếu người dùng đã gõ màu khác với màu của mã hàng.
 */
export function computeItemCodePrefillPatch(
  currentLine: LineTargetForPrefill,
  matchedOption: ItemCodeOption
): ItemCodePrefillResult {
  const patch: ItemCodePrefillResult['patch'] = {}
  let conflictWarning: string | undefined

  // 1. Màu & Phiên bản màu
  const curColor = (currentLine.color ?? '').trim()
  if (!curColor && matchedOption.colorName) {
    patch.color = matchedOption.colorName
    patch.colorVersion = matchedOption.colorVersion || 'STD'
  } else if (curColor && matchedOption.colorName) {
    // Kiểm tra xem màu hiện tại có khớp cơ bản với mã hàng không
    const c1 = curColor.toUpperCase()
    const c2 = matchedOption.colorName.toUpperCase()
    if (!c1.includes(c2) && !c2.includes(c1)) {
      conflictWarning = `Mã hàng quy định màu ${matchedOption.colorName}, khác với màu ${curColor} bạn đang chọn.`
    }
  }

  // 2. Tỷ lệ UV (%)
  const curUv = currentLine.uvPct
  const isUvBlank = curUv === '' || curUv == null || (typeof curUv === 'number' && isNaN(curUv))
  if (isUvBlank && matchedOption.uvPct != null) {
    patch.uvPct = String(matchedOption.uvPct)
  }

  // 3. Loại lưới (meshType)
  const curMesh = (currentLine.meshType ?? '').trim()
  if (!curMesh && matchedOption.meshType) {
    patch.meshType = matchedOption.meshType
  }

  // 4. Mã màu (mbCode)
  const curMb = (currentLine.mbCode ?? '').trim()
  if (!curMb && matchedOption.mbCode) {
    patch.mbCode = matchedOption.mbCode
  }

  return { patch, conflictWarning }
}
