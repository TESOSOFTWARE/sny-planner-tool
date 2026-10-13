export interface ItemCodeOption {
  code: string
  label: string
  prefix: string
  // colorName / colorVersion / uvPct / mbCode chỉ còn do API điền từ ĐƠN ĐÃ LƯU cùng mã (item-codes route);
  // catalog không khai báo vì MasterData không có nguồn rõ cho các trường này (xem chú thích catalog).
  colorName?: string
  colorVersion?: string
  uvPct?: number
  meshType?: string
  mbCode?: string
}

/**
 * 13 mã Finish goods chuẩn từ MasterData_update_100426.xlsx (sheet MasterData_100426, dòng 116-128).
 * Độ dài: 16 ký tự, 3 số cuối là Rev gắn theo số PI gốc.
 * label = "Customer name · COLOR (ký hiệu nguyên văn) · Goods Decs"; meshType = Goods Decs khi là loại lưới.
 * Không suy màu/UV/MB từ các đoạn trong mã: ký hiệu màu 3 chữ chưa có bảng giải nghĩa (K-7), cột
 * "UV% / Wid" với thành phẩm nhiều khả năng là khổ (K-8). REPORT/12102026/CLAUDE/PHUONG_AN_ITEM_CODE_NGUON_DU_LIEU_12102026.md
 */
export const FINISHED_GOODS_ITEM_CODES: ItemCodeOption[] = [
  { code: 'GBN1GRE260205054', label: 'GBN 26-054 · GRE · Scaffolding net', prefix: 'GBN', meshType: 'Scaffolding net' },
  { code: 'GBN1RED250250024', label: 'GBN 25-024 · RED · GREEN', prefix: 'GBN' },
  { code: 'ASM1RED260340001', label: 'ASMAAS 26-1 · RED · TAPE DESERT Sand', prefix: 'ASM', meshType: 'TAPE DESERT Sand' },
  { code: 'LCS1GRE260210001', label: 'LCS · GRE · 01 LCS1GRE260210001', prefix: 'LCS' },
  { code: 'NNV1BLU260605001', label: 'NN Việt Nam · BLU · 01 NNV1BLU260605001', prefix: 'NNV' },
  { code: 'DLT1GRE260305003', label: 'DLT 26-3 · GRE · Shade net M+T FOREST GREEN', prefix: 'DLT', meshType: 'Shade net M+T FOREST GREEN' },
  { code: 'ALR1BLU250205010', label: 'ALRobooa 25-10 · BLU · Shade net Mono Dark Green', prefix: 'ALR', meshType: 'Shade net Mono Dark Green' },
  { code: 'SSC1BLU260204501', label: 'Sunshine 26-1 · BLU · ORANGE', prefix: 'SSC' },
  { code: 'DCH1BRO250402001', label: 'DCH 25-1 · BRO · Japanese Mesh BROWNISH GREEN', prefix: 'DCH', meshType: 'Japanese Mesh BROWNISH GREEN' },
  { code: 'GBN1RED250305071', label: 'GBN26-71 · RED · Scaffolding net', prefix: 'GBN', meshType: 'Scaffolding net' },
  { code: 'GBN1KAR250305071', label: 'GBN26-71 · KAR · Scaffolding net', prefix: 'GBN', meshType: 'Scaffolding net' },
  { code: 'GBN1BLU250205071', label: 'GBN26-71 · BLU · Scaffolding net', prefix: 'GBN', meshType: 'Scaffolding net' },
  { code: 'GBN1BLU250305071', label: 'GBN26-71 · BLU · Scaffolding net', prefix: 'GBN', meshType: 'Scaffolding net' },
]

/**
 * Trích xuất tiền tố khách hàng từ PI Number.
 * 'GBN26-071' -> 'GBN'; 'DLT 26-3' -> 'DLT'; 'ASMAAS 26-1' -> 'ASM'
 */
export function piPrefix(piNumber: string): string {
  const letters = (piNumber.trim().match(/^[A-Za-z]+/)?.[0] ?? '').toUpperCase()
  return letters.slice(0, 3)
}

/**
 * Lọc danh mục Finish goods phù hợp với PI hoặc tiền tố.
 */
export function getCatalogItemCodesForPi(piNumberOrPrefix: string): ItemCodeOption[] {
  const prefix = piPrefix(piNumberOrPrefix)
  if (!prefix) return FINISHED_GOODS_ITEM_CODES
  return FINISHED_GOODS_ITEM_CODES.filter(
    (item) =>
      item.code.toUpperCase().startsWith(prefix) ||
      item.prefix.toUpperCase().startsWith(prefix) ||
      prefix.startsWith(item.prefix.toUpperCase())
  )
}
