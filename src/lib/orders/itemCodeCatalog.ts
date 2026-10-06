export interface ItemCodeOption {
  code: string
  label: string
  prefix: string
  colorName?: string
  colorVersion?: string
  uvPct?: number
  meshType?: string
  mbCode?: string
}

/**
 * 13 mã Finish goods chuẩn từ MasterData_update_100426.xlsx (sheet MasterData_100426, dòng 116-128).
 * Độ dài: 16 ký tự, 3 số cuối là Rev gắn theo số PI gốc.
 * Kèm metadata quy cách để hỗ trợ auto-fill khi ô đang để trống.
 */
export const FINISHED_GOODS_ITEM_CODES: ItemCodeOption[] = [
  {
    code: 'GBN1GRE260205054',
    label: 'GBN 26-054 · GRE · Scaffolding net',
    prefix: 'GBN',
    colorName: 'GREY',
    colorVersion: 'STD',
    uvPct: 2.0,
    meshType: 'Scaffolding net',
  },
  {
    code: 'GBN1RED250250024',
    label: 'GBN 25-024 · RED · GREEN',
    prefix: 'GBN',
    colorName: 'RED',
    colorVersion: 'STD',
    uvPct: 2.0,
    meshType: 'GREEN',
  },
  {
    code: 'ASM1RED260340001',
    label: 'ASMAAS 26-1 · RED · TAPE DESERT Sand',
    prefix: 'ASM',
    colorName: 'DESERT SAND',
    colorVersion: 'Version A',
    uvPct: 3.0,
    meshType: 'TAPE DESERT Sand',
    mbCode: '3160-2',
  },
  {
    code: 'LCS1GRE260210001',
    label: 'LCS · GRE · 01 LCS1GRE260210001',
    prefix: 'LCS',
    colorName: 'GREY',
    colorVersion: 'STD',
    uvPct: 2.0,
    meshType: '01 LCS1GRE260210001',
  },
  {
    code: 'NNV1BLU260605001',
    label: 'NN Việt Nam · BLU · 01 NNV1BLU260605001',
    prefix: 'NNV',
    colorName: 'BLUE',
    colorVersion: 'STD',
    uvPct: 6.0,
    meshType: '01 NNV1BLU260605001',
  },
  {
    code: 'DLT1GRE260305003',
    label: 'DLT 26-3 · GRE · Shade net M+T FOREST GREEN',
    prefix: 'DLT',
    colorName: 'DARK GREEN',
    colorVersion: 'STD',
    uvPct: 3.0,
    meshType: 'Shade net M+T FOREST GREEN',
  },
  {
    code: 'ALR1BLU250205010',
    label: 'ALRobooa 25-10 · BLU · Shade net Mono Dark Green',
    prefix: 'ALR',
    colorName: 'DARK GREEN',
    colorVersion: 'STD',
    uvPct: 2.0,
    meshType: 'Shade net Mono Dark Green',
  },
  {
    code: 'SSC1BLU260204501',
    label: 'Sunshine 26-1 · BLU · ORANGE',
    prefix: 'SSC',
    colorName: 'ORANGE',
    colorVersion: 'STD',
    uvPct: 2.0,
    meshType: 'ORANGE',
  },
  {
    code: 'DCH1BRO250402001',
    label: 'DCH 25-1 · BRO · Japanese Mesh BROWNISH GREEN',
    prefix: 'DCH',
    colorName: 'BROWN',
    colorVersion: 'STD',
    uvPct: 4.0,
    meshType: 'Japanese Mesh BROWNISH GREEN',
  },
  {
    code: 'GBN1RED250305071',
    label: 'GBN26-71 · RED · Scaffolding net',
    prefix: 'GBN',
    colorName: 'RED',
    colorVersion: 'STD',
    uvPct: 3.0,
    meshType: 'Scaffolding net',
  },
  {
    code: 'GBN1KAR250305071',
    label: 'GBN26-71 · KAR · Scaffolding net',
    prefix: 'GBN',
    colorName: 'KAR',
    colorVersion: 'STD',
    uvPct: 3.0,
    meshType: 'Scaffolding net',
  },
  {
    code: 'GBN1BLU250205071',
    label: 'GBN26-71 · BLU · Scaffolding net (UV 02)',
    prefix: 'GBN',
    colorName: 'BLUE',
    colorVersion: 'STD',
    uvPct: 2.0,
    meshType: 'Scaffolding net',
  },
  {
    code: 'GBN1BLU250305071',
    label: 'GBN26-71 · BLU · Scaffolding net (UV 03)',
    prefix: 'GBN',
    colorName: 'BLUE',
    colorVersion: 'STD',
    uvPct: 3.0,
    meshType: 'Scaffolding net',
  },
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
