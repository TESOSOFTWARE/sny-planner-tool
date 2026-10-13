import type { ItemCodeOption } from './itemCodeCatalog'

export interface LineTargetForPrefill {
  meshType?: string | null
}

export interface ItemCodePrefillResult {
  patch: {
    meshType?: string
  }
  conflictWarning?: string
}

/**
 * Tính trường cần điền theo Item Code. Chỉ áp dụng cho LOẠI LƯỚI — trường duy nhất khách yêu cầu
 * ([FB 12/10 #3]) và có nguồn rõ (MasterData cột Goods Decs / đơn đã lưu cùng mã).
 *
 * Không tự điền / không cảnh báo màu, UV%, mã MB: ký hiệu màu 3 chữ trong mã chưa có bảng giải nghĩa
 * và cột "UV% / Wid" với thành phẩm nhiều khả năng là khổ. Chờ khách trả lời K-7/K-8, xem
 * REPORT/12102026/CLAUDE/PHUONG_AN_ITEM_CODE_NGUON_DU_LIEU_12102026.md.
 */
export function computeItemCodePrefillPatch(
  currentLine: LineTargetForPrefill,
  matchedOption: ItemCodeOption,
  meshTypeWasAutoFilled?: boolean
): ItemCodePrefillResult {
  const patch: ItemCodePrefillResult['patch'] = {}
  let conflictWarning: string | undefined

  const curMesh = (currentLine.meshType ?? '').trim()
  if ((!curMesh || meshTypeWasAutoFilled) && matchedOption.meshType) {
    patch.meshType = matchedOption.meshType
  } else if (meshTypeWasAutoFilled && !matchedOption.meshType) {
    patch.meshType = ''
  } else if (meshTypeWasAutoFilled === false && curMesh && matchedOption.meshType && curMesh.toUpperCase() !== matchedOption.meshType.trim().toUpperCase()) {
    conflictWarning = `Mã hàng quy định loại lưới ${matchedOption.meshType}, khác với loại lưới ${curMesh} bạn đã nhập.`
  }

  return { patch, conflictWarning }
}
