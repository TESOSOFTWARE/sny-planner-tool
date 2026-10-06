// src/lib/excel/parseOrderList.ts
// Server-only utility — parses ORDER_LIST .xlsx file using SheetJS.
// Validates each row strictly against mandatory order rules matching MultiLineOrderForm.

import * as XLSX from 'xlsx'
import type { OrderImportDecision, OrderImportResolution, ParsedOrder, ProductionOrder } from '@/types'
import { importedOrderRowSchema, draftOrderStateSchema, isValidISODate } from '@/lib/validations/order'

// ── Value coercion helpers ────────────────────────────────────────────────────

function safeStr(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function safeNum(v: unknown): number | null {
  if (v == null) return null
  if (v instanceof Date) return null
  if (typeof v === 'string') {
    const s = v.replace('%', '').trim()
    if (s === '') return null
    const n = Number(s)
    return isNaN(n) ? null : n
  }
  const n = Number(v)
  return isNaN(n) ? null : n
}

export function normalizeUvPct(v: unknown): number | null {
  if (v == null) return null
  if (v instanceof Date) return null
  if (typeof v === 'string') {
    const trimmed = v.trim()
    if (!trimmed) return null
    if (trimmed.endsWith('%')) {
      const num = parseFloat(trimmed.replace('%', '').trim())
      return isNaN(num) ? null : Math.max(0, Math.min(100, num))
    }
    const num = parseFloat(trimmed)
    if (isNaN(num)) return null
    if (num > 0 && num <= 1) {
      return Math.round(num * 10000) / 100
    }
    return Math.max(0, Math.min(100, num))
  }
  if (typeof v === 'number') {
    if (isNaN(v)) return null
    if (v > 0 && v <= 1) {
      return Math.round(v * 10000) / 100
    }
    return Math.max(0, Math.min(100, v))
  }
  return null
}

function safeInt(v: unknown): number | null {
  const n = safeNum(v)
  return n == null ? null : n
}

function safeDate(v: unknown): string | null {
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10)
  }
  if (typeof v === 'string' && v.trim()) {
    const cleaned = v.trim()
    if (isValidISODate(cleaned)) return cleaned
    const d = new Date(cleaned)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return null
}

function safeBool(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'boolean') return v
  const s = String(v).trim().toLowerCase()
  if (s === 'true' || s === 'yes' || s === 'y' || s === 'x' || s === '1' || s === 'có') return true
  const n = Number(v)
  return !isNaN(n) && n !== 0
}

export function deduplicateValidationErrors(errors: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const err of errors) {
    let key = err.trim()
    if (/Màu/i.test(key)) key = 'Màu'
    else if (/GSM/i.test(key)) key = 'GSM'
    else if (/Khổ/i.test(key)) key = 'Khổ'
    else if (/PI Number/i.test(key)) key = 'PI Number'
    else if (/Khách hàng/i.test(key)) key = 'Khách hàng'
    else if (/Ngày đặt/i.test(key)) key = 'Ngày đặt'
    else if (/chiều dài|tổng mét/i.test(key)) key = 'Chiều dài'
    else if (/Carton/i.test(key)) key = 'Carton'
    else if (/BALE|kiện/i.test(key)) key = 'Bale'
    else if (/Pallet/i.test(key)) key = 'Pallet'
    else if (/tráng màng|laminate/i.test(key)) key = 'Laminated'
    else if (/chống cháy|FR/i.test(key)) key = 'FR'

    if (!seen.has(key)) {
      seen.add(key)
      result.push(err)
    }
  }
  return result
}

// ── Column detector ───────────────────────────────────────────────────────────

function findColIdx(
  headers: unknown[],
  matcher: (h: string) => boolean,
): number {
  return headers.findIndex(
    (h) => h != null && typeof h === 'string' && matcher(h),
  )
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseOrderList(buffer: Buffer): ParsedOrder[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    console.warn('[parseOrderList] Workbook has no sheets')
    return []
  }

  const sheet = wb.Sheets[sheetName]
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
  })

  if (allRows.length < 3) {
    console.warn('[parseOrderList] Sheet has fewer than 3 rows — no data to parse')
    return []
  }

  const headers = allRows[1] as unknown[]
  const dataRows = allRows.slice(2)

  // ── Locate columns by header name ─────────────────────────────────────────
  const piIdColIdx = findColIdx(
    headers,
    (h) => {
      const value = h.toUpperCase()
      return value.includes('PI NUMBER') || value.includes('PI ID')
    },
  )
  // ORDER LIST OFFICIAL labels the actual PI column itself "PI NUMBER".
  // Older templates may use "PI ID" as a label for a display/helper column
  // followed by the real PI value, so only those legacy headers advance one
  // column.  Blindly adding one turns the sequence column into the PI number.
  const piHeader = piIdColIdx >= 0 ? String(headers[piIdColIdx]).toUpperCase() : ''
  const exactPiColIdx = findColIdx(headers, h => h.trim().toUpperCase() === 'PI NUMBER')
  const piNumberColIdx = exactPiColIdx >= 0 ? exactPiColIdx : piIdColIdx >= 0
    ? (piHeader.includes('PI ID') && !piHeader.includes('PI NUMBER') ? piIdColIdx + 1 : piIdColIdx)
    : -1
  const detectedSubLineColIdx = findColIdx(headers, (h) => h.trim().toUpperCase() === 'NO')
  const subLineColIdx = detectedSubLineColIdx >= 0 ? detectedSubLineColIdx : 2

  const customerColIdx = findColIdx(headers, (h) => h.toUpperCase() === 'CUSTOMER')
  const dateColIdx = findColIdx(headers, (h) => h.toLowerCase() === 'date' || h.toUpperCase().includes('ORDER DATE'))
  const gsmColIdx = findColIdx(headers, (h) => h.toUpperCase() === 'GSM')
  const prodGsmColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('PROD') && h.toUpperCase().includes('GSM'))
  const widthColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('WIDTH'))
  const lengthColIdx = findColIdx(
    headers,
    (h) => {
      const value = h.toUpperCase()
      return value.includes('LENGTH') && !value.includes('ROLL') && !value.includes('PIECE') && !value.includes('DELIVERY')
    },
  )
  const colorColIdx = findColIdx(headers, (h) => h.toUpperCase() === 'COLOR' || h.toUpperCase() === 'MÀU')
  const colorVersionColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('COLOR VERSION') || h.toUpperCase().includes('PHIÊN BẢN MÀU') || h.toUpperCase().includes('VERSION'))
  const uvColIdx = findColIdx(headers, (h) => h.toUpperCase() === 'UV' || h.toUpperCase().includes('UV%'))
  const frColIdx = findColIdx(headers, (h) => h.toUpperCase() === 'FR')
  const frPctColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('FR%') || (h.toUpperCase().includes('FR') && h.includes('%')))
  const qtyColIdx = findColIdx(
    headers,
    (h) =>
      h.toUpperCase().includes("QU'") ||
      h.toUpperCase() === 'QTY' ||
      h.toUpperCase().includes('QUANTITY') ||
      h.toUpperCase() === 'SL' ||
      h.toUpperCase().includes('SỐ LƯỢNG'),
  )
  const packingTypeColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('ĐÓNG GÓI') || h.toUpperCase().includes('PACKING TYPE') || (h.toUpperCase().includes('KIỂU') && (h.toUpperCase().includes('ĐƠN') || h.toUpperCase().includes('GÓI'))))
  // UNIT fallback (01/10): file SNY thật dùng cột UNIT thay cho PACKING TYPE/ORDER TYPE.
  const unitColIdx = findColIdx(headers, (h) => h.trim().toUpperCase() === 'UNIT' || h.toUpperCase().includes('ĐƠN VỊ'))
  const orderTypeColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('ORDER TYPE') || (h.toUpperCase().includes('TYPE') && !h.toUpperCase().includes('MESH') && !h.toUpperCase().includes('PACKING') && !h.toUpperCase().includes('PALLET')))
  const rollLenColIdx = findColIdx(headers, (h) => (h.toUpperCase().includes('ROLL') && h.toUpperCase().includes('LEN')) || (h.toUpperCase().includes('MÉT') && h.toUpperCase().includes('CUỘN')))
  const pieceLenColIdx = findColIdx(headers, (h) => (h.toUpperCase().includes('PIECE') && h.toUpperCase().includes('LEN')) || (h.toUpperCase().includes('DÀI') && h.toUpperCase().includes('TẤM')))

  // Multi-tier Packing v4 column finders
  const hasPaperCoreColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('LÕI GIẤY') || h.toUpperCase().includes('PAPER CORE') || h.toUpperCase() === 'LÕI')
  const isHalfFoldedColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('GẤP ĐÔI') || h.toUpperCase().includes('HALF FOLD') || h.toUpperCase().includes('HALF-FOLD'))
  const piecesPerCartonColIdx = findColIdx(headers, (h) => (h.toUpperCase().includes('TẤM') && h.toUpperCase().includes('THÙNG')) || h.toUpperCase().includes('PCS/CARTON') || h.toUpperCase().includes('PCS/BOX') || (h.toUpperCase().includes('PCS') && (h.toUpperCase().includes('BOX') || h.toUpperCase().includes('CARTON'))))
  const piecesPerBaleColIdx = findColIdx(headers, (h) => (h.toUpperCase().includes('TẤM') && h.toUpperCase().includes('KIỆN')) || h.toUpperCase().includes('PCS/BALE') || (h.toUpperCase().includes('PCS') && h.toUpperCase().includes('BALE')))
  const boxDimensionsColIdx = findColIdx(headers, (h) => (h.toUpperCase().includes('KT') && (h.toUpperCase().includes('THÙNG') || h.toUpperCase().includes('KIỆN'))) || h.toUpperCase().includes('BOX DIMENSION'))
  const onPalletColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('ĐÓNG PALLET') || h.toUpperCase().includes('ON PALLET') || h.toUpperCase() === 'PALLET')
  const secondaryPackingTypeColIdx = findColIdx(headers, (h) => (h.toUpperCase().includes('LOẠI') && h.toUpperCase().includes('PALLET')) || h.toUpperCase().includes('PALLET TYPE'))
  const palletDimensionsColIdx = findColIdx(headers, (h) => (h.toUpperCase().includes('KT') && h.toUpperCase().includes('PALLET')) || h.toUpperCase().includes('PALLET DIMENSION'))
  const itemsPerPalletColIdx = findColIdx(headers, (h) => (h.toUpperCase().includes('SL') && h.toUpperCase().includes('PALLET')) || h.toUpperCase().includes('ITEMS/PALLET') || h.toUpperCase().includes('PCS/PALLET') || (h.toUpperCase().includes('ITEMS') && h.toUpperCase().includes('PALLET')))
  const packingNoteColIdx = findColIdx(headers, (h) => (h.toUpperCase().includes('GHI CHÚ') && h.toUpperCase().includes('ĐÓNG GÓI')) || h.toUpperCase().includes('PACKING NOTE'))

  const descColIdx = findColIdx(headers, (h) => h.toUpperCase() === 'DESCRIPTION')
  const remarkColIdx = findColIdx(headers, (h) => h.toUpperCase() === 'REMARK')
  const mbCodeColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('MB') && h.toUpperCase().includes('CODE'))
  const itemCodeColIdx = findColIdx(headers, (h) => (h.toUpperCase().includes('ITEM') && h.toUpperCase().includes('CODE')) || h.toUpperCase() === 'MÃ HÀNG' || h.toUpperCase().includes('MÃ SẢN PHẨM'))
  const meshTypeColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('MESH') || h.toUpperCase().includes('THỂ LOẠI LƯỚI'))
  const needleCountColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('NEEDLE') || h.toUpperCase().includes('SỐ KIM'))
  const beamCountColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('BEAM') || h.toUpperCase().includes('SỐ DÀN'))
  const lineNoteColIdx = findColIdx(headers, (h) => h.toUpperCase() === 'LINE NOTE' || h.toUpperCase() === 'NOTE' || h.toUpperCase().includes('GHI CHÚ DÒNG'))
  const requiresPackingColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('PACK') && (h.toUpperCase().includes('REQUIRE') || h.toUpperCase().includes('PACKING')))
  const deliveryDateColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('DELIVERY') && h.toUpperCase().includes('DATE') || h.toUpperCase().includes('GIAO HÀNG'))
  const containerSizeColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('CONTAINER'))
  const lifecycleColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('LIFECYCLE') || h.toUpperCase() === 'STATUS' || h.toUpperCase().includes('TRẠNG THÁI') || h.toUpperCase().includes('TÌNH TRẠNG'))
  const hasEyeletColIdx = findColIdx(headers, (h) => h.toUpperCase() === 'EYELET' || (h.toUpperCase().includes('HAS') && h.toUpperCase().includes('EYELET')))
  const eyeletColorColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('EYELET') && h.toUpperCase().includes('COLOR') || h.toUpperCase().includes('MÀU KHOEN'))
  const eyeletLinesColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('EYELET') && h.toUpperCase().includes('LINE') || h.toUpperCase().includes('DÒNG KHOEN'))
  const eyeletSpecColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('EYELET') && h.toUpperCase().includes('SPEC') || h.toUpperCase().includes('QUY CÁCH KHOEN'))

  // Outer wrapping, Lamination & Tolerance finders
  const outerWrappingColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('VỎ BỌC') || h.toUpperCase().includes('WRAPPING'))
  const isLaminatedColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('TRÁNG MÀNG') || h.toUpperCase().includes('LAMINAT') || h.toUpperCase() === 'COATING' || h.toUpperCase().includes('COATING'))
  const rawFabricGsmColIdx = findColIdx(headers, (h) => (h.toUpperCase().includes('GSM') && h.toUpperCase().includes('MỘC')) || h.toUpperCase().includes('RAW GSM') || h.toUpperCase().includes('RAW FABRIC GSM') || h.toUpperCase().includes('RAW_GSM') || h.toUpperCase().includes('BASE GSM'))
  const coatingGsmColIdx = findColIdx(headers, (h) => (h.toUpperCase().includes('GSM') && h.toUpperCase().includes('TRÁNG')) || h.toUpperCase().includes('COATING GSM'))
  const finishedGsmColIdx = findColIdx(headers, (h) => (h.toUpperCase().includes('GSM') && h.toUpperCase().includes('THÀNH PHẨM')) || h.toUpperCase().includes('FINISHED GSM'))
  const toleranceQtyColIdx = findColIdx(headers, (h) => (h.toUpperCase().includes('DUNG SAI') && h.toUpperCase().includes('SL')) || (h.toUpperCase().includes('TOLERANCE') && h.toUpperCase().includes('QTY')) || h.toUpperCase().includes('QTY TOLERANCE'))
  const toleranceSpecColIdx = findColIdx(headers, (h) => (h.toUpperCase().includes('DUNG SAI') && (h.toUpperCase().includes('QUY CÁCH') || h.toUpperCase().includes('SPEC'))) || (h.toUpperCase().includes('TOLERANCE') && h.toUpperCase().includes('SPEC')) || h.toUpperCase().includes('SPEC TOLERANCE'))

  const results: ParsedOrder[] = []
  const explicitSubLinesByPi = new Map<string, Set<number>>()

  // Reserve every explicit NO before generating values for blank cells.  This
  // prevents a blank row from taking a number that appears later in the same
  // PI group (for example: 1, blank, 2 becoming 1, 3, 2).
  for (const row of dataRows) {
    if (!Array.isArray(row)) continue
    const rawPi = piNumberColIdx >= 0 ? safeStr(row[piNumberColIdx]) : null
    const explicitNo = safeInt(row[subLineColIdx])
    if (explicitNo == null || explicitNo <= 0) continue
    const piKey = rawPi || 'CHƯA_CÓ_PI'
    const values = explicitSubLinesByPi.get(piKey) ?? new Set<number>()
    values.add(explicitNo)
    explicitSubLinesByPi.set(piKey, values)
  }
  const generatedSubLineCounters = new Map<string, number>()

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    if (!Array.isArray(row)) continue

    const get = (colIdx: number): unknown => (colIdx >= 0 ? row[colIdx] : null)

    const rawPi = piNumberColIdx >= 0 ? safeStr(get(piNumberColIdx)) : null
    const rawCustomer = safeStr(get(customerColIdx))
    const rawDate = safeDate(get(dateColIdx))
    const rawGsm = safeInt(get(gsmColIdx))
    const rawWidthM = safeNum(get(widthColIdx))
    const rawLengthM = safeNum(get(lengthColIdx))
    const rawColor = safeStr(get(colorColIdx))

    // Completely empty rows with no PI and no Customer → skip entirely
    if (!rawPi && !rawCustomer && !rawColor && !rawGsm && !rawWidthM && !rawLengthM) {
      continue
    }

    const piNumber = rawPi || 'CHƯA_CÓ_PI'
    const customer = rawCustomer || ''
    const orderDate = rawDate || ''
    const gsm = rawGsm || 0
    const widthM = rawWidthM || 0
    const lengthM = rawLengthM
    const color = rawColor ? rawColor.toUpperCase() : ''

    const fileSubLine = safeInt(get(subLineColIdx))
    const noWasGenerated = fileSubLine == null || fileSubLine <= 0
    const usedSubLines = explicitSubLinesByPi.get(piNumber) ?? new Set<number>()
    let subLineIndex = fileSubLine != null && fileSubLine > 0 ? fileSubLine : null
    if (subLineIndex == null) {
      let next = generatedSubLineCounters.get(piNumber) ?? 0
      do {
        next += 1
      } while (usedSubLines.has(next))
      subLineIndex = next
      usedSubLines.add(next)
      generatedSubLineCounters.set(piNumber, next)
      explicitSubLinesByPi.set(piNumber, usedSubLines)
    }

    const qty = safeInt(get(qtyColIdx))
    const uvPct = normalizeUvPct(get(uvColIdx))
    const frPct = safeNum(get(frPctColIdx))
    // Percentage-only templates infer FR; legacy files keep their explicit flag.
    const frFlag = frColIdx >= 0 ? safeBool(get(frColIdx)) : frPct != null && frPct > 0
    const description = safeStr(get(descColIdx))
    const remark = safeStr(get(remarkColIdx))
    const mbCode = safeStr(get(mbCodeColIdx))
    const itemCode = safeStr(get(itemCodeColIdx))
    const productionGsm = safeInt(get(prodGsmColIdx))
    let rollLength = safeNum(get(rollLenColIdx))
    let pieceLength = safeNum(get(pieceLenColIdx))
    const meshType = safeStr(get(meshTypeColIdx))
    const needleCount = safeInt(get(needleCountColIdx))
    const beamCount = safeInt(get(beamCountColIdx))
    const lineNote = safeStr(get(lineNoteColIdx))
    const requiresPacking = safeBool(get(requiresPackingColIdx))
    const deliveryDate = safeDate(get(deliveryDateColIdx))
    const containerSize = safeStr(get(containerSizeColIdx))
    const hasEyelet = safeBool(get(hasEyeletColIdx))
    const eyeletColor = safeStr(get(eyeletColorColIdx))
    const eyeletLines = safeInt(get(eyeletLinesColIdx))
    const eyeletSpec = safeStr(get(eyeletSpecColIdx))

    // v4 Specs & Packing
    const colorVersion = safeStr(get(colorVersionColIdx))

    const rawLifecycle = safeStr(get(lifecycleColIdx))?.toUpperCase() || ''
    let lifecycleStatus: 'DRAFT' | 'RESERVED' | 'APPROVED' = 'APPROVED'
    if (rawLifecycle.includes('DRAFT') || rawLifecycle.includes('NHÁP')) lifecycleStatus = 'DRAFT'
    else if (rawLifecycle.includes('RESERVED') || rawLifecycle.includes('RESERVE') || rawLifecycle.includes('PLACEHOLDER') || rawLifecycle.includes('GIỮ')) lifecycleStatus = 'RESERVED'
    const isPlaceholder = lifecycleStatus === 'RESERVED'

    const rawPacking = safeStr(get(packingTypeColIdx))?.toUpperCase() || ''
    let primaryPackingType: 'ROLL' | 'BALE' | 'CARTON' | 'HEMMED' = 'ROLL'
    // H4 (01/10): từ khóa chốt từ dữ liệu thật SNY (ORDER LIST 2023-2026, WI SEDCO26-1):
    // HEMMED / HEMMED EDGES / REINFORCED HEMMED / WEBBING HEM / HEM (thuật ngữ xưởng may).
    // Check HEMMED TRƯỚC CARTON/BALE để chuỗi như "HEMMED CARTON" không bị nhận nhầm.
    // "HEM" đứng một mình phải match word-boundary (tránh CHEMICAL / SCHEME / THEME).
    const isHemmed = rawPacking.includes('HEMMED')
      || rawPacking.includes('WEBBING HEM')
      || rawPacking.includes('MAY VIỀN')
      || rawPacking.includes('MAY VIEN')
      || rawPacking.includes('ĐÓNG KHUY')
      || rawPacking.includes('DONG KHUY')
      || /\bHEM\b/.test(rawPacking)
    if (isHemmed) {
      primaryPackingType = 'HEMMED'
    } else if (rawPacking.includes('CARTON') || rawPacking.includes('THÙNG')) {
      primaryPackingType = 'CARTON'
    } else if (rawPacking.includes('BALE') || rawPacking.includes('KIỆN')) {
      primaryPackingType = 'BALE'
    } else if (rawPacking.includes('ROLL') || rawPacking.includes('CUỘN')) {
      primaryPackingType = 'ROLL'
    }

    // UNIT fallback (01/10): file SNY thật (ORDER LIST 2023-2026, 3345 dòng) dùng cột UNIT,
    // cột PACKING bỏ trống 3297/3345. Chỉ suy từ UNIT khi PACKING trống — PACKING tường minh thắng.
    // PCS/PANEL/BOX/PACK → CARTON (hàng tấm đóng thùng); BALE/BALES → BALE; còn lại giữ ROLL.
    // orderType phía dưới tự suy đúng từ packing (CARTON→pieces, BALE→meters, ROLL→rolls).
    if (rawPacking === '') {
      const rawUnit = safeStr(get(unitColIdx))?.toUpperCase() || ''
      if (/\b(BOX|PACK|PCS|PANEL)\b/.test(rawUnit)) primaryPackingType = 'CARTON'
      else if (/\bBALES?\b/.test(rawUnit)) primaryPackingType = 'BALE'
    }

    const rawPaperCore = get(hasPaperCoreColIdx)
    const hasPaperCore = primaryPackingType === 'ROLL'
      ? (rawPaperCore != null ? safeBool(rawPaperCore) : true)
      : false
    const isHalfFolded = safeBool(get(isHalfFoldedColIdx))
    const piecesPerCarton = safeInt(get(piecesPerCartonColIdx))
    const piecesPerBale = safeInt(get(piecesPerBaleColIdx))
    const boxDimensions = safeStr(get(boxDimensionsColIdx))

    let subPackingType: 'CARTON' | 'BALE' | null = null
    if (primaryPackingType === 'HEMMED') {
      if (piecesPerCarton != null && piecesPerCarton > 0) subPackingType = 'CARTON'
      else if (piecesPerBale != null && piecesPerBale > 0) subPackingType = 'BALE'
      else if (rawPacking.includes('CARTON') || rawPacking.includes('THÙNG')) subPackingType = 'CARTON'
      else if (rawPacking.includes('BALE') || rawPacking.includes('KIỆN')) subPackingType = 'BALE'
      else subPackingType = 'CARTON'
    }

    const onPallet = safeBool(get(onPalletColIdx))
    let secondaryPackingType: 'NONE' | 'WOOD_PALLET' | 'IRON_PALLET' | 'PLASTIC_PALLET' = 'NONE'
    const rawPalletType = safeStr(get(secondaryPackingTypeColIdx))?.toUpperCase() || ''
    if (rawPalletType.includes('WOOD') || rawPalletType.includes('GỖ')) secondaryPackingType = 'WOOD_PALLET'
    else if (rawPalletType.includes('IRON') || rawPalletType.includes('SẮT') || rawPalletType.includes('STEEL')) secondaryPackingType = 'IRON_PALLET'
    else if (rawPalletType.includes('PLASTIC') || rawPalletType.includes('NHỰA')) secondaryPackingType = 'PLASTIC_PALLET'
    else if (onPallet) secondaryPackingType = 'WOOD_PALLET'

    const palletDimensions = safeStr(get(palletDimensionsColIdx))
    const itemsPerPallet = safeInt(get(itemsPerPalletColIdx))
    const packingNote = safeStr(get(packingNoteColIdx))

    const rawWrapping = safeStr(get(outerWrappingColIdx))?.toUpperCase() || ''
    let outerWrapping: 'POLYBAG' | 'TARPAULIN' | 'NONE' = 'POLYBAG'
    if (rawWrapping.includes('TARPAULIN') || rawWrapping.includes('BẠT')) outerWrapping = 'TARPAULIN'
    else if (rawWrapping.includes('NONE') || rawWrapping.includes('KHÔNG')) outerWrapping = 'NONE'
    else outerWrapping = 'POLYBAG'

    const isLaminated = safeBool(get(isLaminatedColIdx))
    const rawFabricGsm = safeInt(get(rawFabricGsmColIdx))
    const coatingGsm = safeInt(get(coatingGsmColIdx))
    const finishedGsm = safeInt(get(finishedGsmColIdx)) ?? (isLaminated ? gsm : null)
    const toleranceQtyPct = safeNum(get(toleranceQtyColIdx)) ?? 10.0
    const toleranceSpecPct = safeNum(get(toleranceSpecColIdx)) ?? 5.0

    // Đ5: đơn laminate — GSM đơn hàng chính là GSM thành phẩm (khỏi nhập 2 lần)
    let effectiveGsm = gsm
    if (isLaminated && effectiveGsm <= 0 && finishedGsm != null && finishedGsm > 0) {
      effectiveGsm = finishedGsm
    }

    let orderType: 'meters' | 'rolls' | 'pieces' = 'meters'
    const rawType = safeStr(get(orderTypeColIdx))?.toLowerCase()
    if (rawType === 'rolls' || (qty != null && rollLength != null)) {
      orderType = 'rolls'
    } else if (rawType === 'pieces' || (qty != null && pieceLength != null)) {
      orderType = 'pieces'
    } else if (rawType === 'meters') {
      orderType = 'meters'
    } else {
      // Auto-derived from primaryPackingType if not explicitly given
      if (primaryPackingType === 'CARTON') orderType = 'pieces'
      else if (primaryPackingType === 'BALE') orderType = 'meters'
      else orderType = 'rolls'
    }

    // Fallback: If rollLength / pieceLength is missing from separate column, use lengthM from LENGTH column
    if (orderType === 'rolls' && rollLength == null && lengthM != null && lengthM > 0) {
      rollLength = lengthM
    }
    if (orderType === 'pieces' && pieceLength == null && lengthM != null && lengthM > 0) {
      pieceLength = lengthM
    }

    // ── Row-Level Mandatory Validation ───────────────────────────────────────
    const rawValidationErrors: string[] = []

    if (!rawPi) rawValidationErrors.push('Thiếu PI Number')
    if (!customer) rawValidationErrors.push('Thiếu Khách hàng')
    if (!orderDate) rawValidationErrors.push('Thiếu Ngày đặt hàng (YYYY-MM-DD)')

    if (lifecycleStatus !== 'DRAFT') {
      if (!color) rawValidationErrors.push('Thiếu Màu')
      if (widthM <= 0) rawValidationErrors.push('Thiếu Khổ m (>0)')
      if (effectiveGsm <= 0) rawValidationErrors.push('Thiếu GSM (>0)')

      if (orderType === 'meters' && (lengthM == null || lengthM <= 0)) {
        rawValidationErrors.push('Thiếu Chiều dài mét (>0)')
      }
      if (orderType === 'rolls') {
        if (qty == null || qty <= 0) rawValidationErrors.push('Thiếu Số cuộn (>0)')
        if (rollLength == null || rollLength <= 0) rawValidationErrors.push('Thiếu Mét/cuộn (>0)')
      }
      if (orderType === 'pieces') {
        if (qty == null || qty <= 0) rawValidationErrors.push('Thiếu Số tấm (>0)')
        if (pieceLength == null || pieceLength <= 0) rawValidationErrors.push('Thiếu Chiều dài tấm (>0)')
      }

      if (frFlag && (frPct == null || frPct <= 0)) {
        rawValidationErrors.push('Thiếu % chống cháy (FR% > 0)')
      }

      if (primaryPackingType === 'CARTON' && (piecesPerCarton == null || piecesPerCarton <= 0)) {
        rawValidationErrors.push('Thiếu số tấm/thùng khi chọn đóng thùng Carton (piecesPerCarton > 0)')
      }
      if (primaryPackingType === 'BALE' && (piecesPerBale == null || piecesPerBale <= 0)) {
        rawValidationErrors.push('Thiếu số tấm/kiện khi chọn đóng kiện nén BALE (piecesPerBale > 0)')
      }
      if (onPallet && (!palletDimensions || !palletDimensions.trim())) {
        rawValidationErrors.push('Thiếu kích thước Pallet khi chọn đóng trên Pallet')
      }
      if (isLaminated && (rawFabricGsm == null || rawFabricGsm <= 0 || (finishedGsm == null && effectiveGsm <= 0))) {
        rawValidationErrors.push('Hàng tráng màng ngoài bắt buộc có GSM dệt mộc và GSM thành phẩm')
      }
    }

    const payloadForValidation = {
      piNumber,
      subLineIndex,
      customer,
      orderDate,
      widthM: lifecycleStatus === 'DRAFT' && widthM <= 0 ? null : widthM,
      lengthM,
      gsm: lifecycleStatus === 'DRAFT' && effectiveGsm <= 0 ? null : effectiveGsm,
      productionGsm,
      color: lifecycleStatus === 'DRAFT' && !color ? null : color,
      colorVersion,
      colorRecipeSnapshot: null,
      lifecycleStatus,
      isPlaceholder,
      orderType,
      qty,
      rollLength,
      pieceLength,
      primaryPackingType,
      subPackingType,
      hasPaperCore,
      isHalfFolded,
      outerWrapping,
      piecesPerCarton,
      piecesPerBale,
      boxDimensions,
      onPallet,
      secondaryPackingType,
      palletDimensions,
      itemsPerPallet,
      packingNote,
      isLaminated,
      rawFabricGsm,
      coatingGsm,
      finishedGsm,
      toleranceQtyPct,
      toleranceSpecPct,
      uvPct,
      frFlag,
      frPct,
      description,
      remark,
      mbCode,
      itemCode,
      meshType,
      needleCount,
      beamCount,
      lineNote,
      requiresPacking,
      deliveryDate,
      containerSize,
      hasEyelet,
      eyeletColor,
      eyeletLines,
      eyeletSpec,
    }

    const schemaToUse = lifecycleStatus === 'DRAFT' ? draftOrderStateSchema : importedOrderRowSchema
    const schemaResult = schemaToUse.safeParse(payloadForValidation)
    if (!schemaResult.success) {
      for (const issue of schemaResult.error.issues) {
        rawValidationErrors.push(issue.message)
      }
    }

    const validationErrors = deduplicateValidationErrors(rawValidationErrors)
    const isValid = validationErrors.length === 0

    results.push({
      piNumber,
      subLineIndex,
      customer,
      orderDate,
      widthM,
      lengthM,
      gsm: effectiveGsm,
      color,
      colorVersion,
      colorRecipeSnapshot: null,
      lifecycleStatus,
      isPlaceholder,
      productionGsm,
      orderType,
      qty,
      rollLength,
      pieceLength,
      primaryPackingType,
      subPackingType,
      hasPaperCore,
      isHalfFolded,
      outerWrapping,
      piecesPerCarton,
      piecesPerBale,
      boxDimensions,
      onPallet,
      secondaryPackingType,
      palletDimensions,
      itemsPerPallet,
      packingNote,
      isLaminated,
      rawFabricGsm,
      coatingGsm,
      finishedGsm,
      toleranceQtyPct,
      toleranceSpecPct,
      uvPct,
      frFlag,
      frPct,
      description,
      remark,
      mbCode,
      itemCode,
      meshType,
      needleCount,
      beamCount,
      lineNote,
      requiresPacking,
      deliveryDate,
      containerSize,
      hasEyelet,
      eyeletColor,
      eyeletLines,
      eyeletSpec,
      noWasGenerated,
      isValid,
      validationErrors,
    })
  }

  return results
}

const IMPORT_COMPARISON_FIELDS = [
  'customer',
  'orderDate',
  'widthM',
  'lengthM',
  'gsm',
  'productionGsm',
  'color',
  'colorVersion',
  'orderType',
  'qty',
  'rollLength',
  'pieceLength',
  'primaryPackingType',
  'hasPaperCore',
  'isHalfFolded',
  'piecesPerCarton',
  'piecesPerBale',
  'boxDimensions',
  'onPallet',
  'secondaryPackingType',
  'palletDimensions',
  'itemsPerPallet',
  'packingNote',
  'uvPct',
  'frFlag',
  'frPct',
  'description',
  'remark',
  'lineNote',
  'requiresPacking',
  'deliveryDate',
  'containerSize',
  'meshType',
  'needleCount',
  'beamCount',
  'mbCode',
  'itemCode',
  'hasEyelet',
  'eyeletColor',
  'eyeletLines',
  'eyeletSpec',
] as const

type ImportComparisonField = typeof IMPORT_COMPARISON_FIELDS[number]

function normalizedText(value: unknown, caseInsensitive = false): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return caseInsensitive ? text.toUpperCase() : text
}

function normalizedDate(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const date = String(value).trim()
  return date ? date.slice(0, 10) : null
}

function normalizedNumber(value: unknown): number | null {
  if (value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function effectiveLength(row: ParsedOrder | ProductionOrder): number | null {
  const orderType = String(row.orderType ?? 'meters')
  const qty = normalizedNumber(row.qty)
  if (orderType === 'rolls') {
    const rollLength = normalizedNumber(row.rollLength)
    return qty != null && rollLength != null ? qty * rollLength : null
  }
  if (orderType === 'pieces') {
    const pieceLength = normalizedNumber(row.pieceLength)
    return qty != null && pieceLength != null ? qty * pieceLength : null
  }
  return normalizedNumber(row.lengthM)
}

function extractCustomerName(row: ParsedOrder | ProductionOrder): string | null {
  if (!row) return null
  const raw = (row as any).customer
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object' && typeof raw.name === 'string') return raw.name
  return null
}

function comparisonValues(row: ParsedOrder | ProductionOrder): Record<ImportComparisonField, unknown> {
  return {
    customer: normalizedText(extractCustomerName(row), true),
    orderDate: normalizedDate(row.orderDate),
    widthM: normalizedNumber(row.widthM),
    lengthM: effectiveLength(row),
    gsm: normalizedNumber(row.gsm),
    productionGsm: normalizedNumber(row.productionGsm),
    color: normalizedText(row.color, true),
    colorVersion: normalizedText((row as any).colorVersion, true),
    orderType: normalizedText(row.orderType) ?? 'meters',
    qty: normalizedNumber(row.qty),
    rollLength: normalizedNumber(row.rollLength),
    pieceLength: normalizedNumber(row.pieceLength),
    primaryPackingType: normalizedText((row as any).primaryPackingType, true) ?? 'ROLL',
    hasPaperCore: (row as any).hasPaperCore !== false,
    isHalfFolded: (row as any).isHalfFolded === true,
    piecesPerCarton: normalizedNumber((row as any).piecesPerCarton),
    piecesPerBale: normalizedNumber((row as any).piecesPerBale),
    boxDimensions: normalizedText((row as any).boxDimensions),
    onPallet: (row as any).onPallet === true,
    secondaryPackingType: normalizedText((row as any).secondaryPackingType, true) ?? 'NONE',
    palletDimensions: normalizedText((row as any).palletDimensions),
    itemsPerPallet: normalizedNumber((row as any).itemsPerPallet),
    packingNote: normalizedText((row as any).packingNote),
    uvPct: normalizedNumber(row.uvPct),
    frFlag: row.frFlag === true,
    frPct: normalizedNumber(row.frPct),
    description: normalizedText(row.description),
    remark: normalizedText(row.remark),
    lineNote: normalizedText(row.lineNote),
    requiresPacking: row.requiresPacking === true,
    deliveryDate: normalizedDate(row.deliveryDate),
    containerSize: normalizedText(row.containerSize),
    meshType: normalizedText(row.meshType),
    needleCount: normalizedNumber(row.needleCount),
    beamCount: normalizedNumber(row.beamCount),
    mbCode: normalizedText(row.mbCode),
    itemCode: safeStr((row as any).itemCode),
    hasEyelet: row.hasEyelet === true,
    eyeletColor: normalizedText(row.eyeletColor),
    eyeletLines: normalizedNumber(row.eyeletLines),
    eyeletSpec: normalizedText(row.eyeletSpec),
  }
}

function importIdentity(piNumber: unknown, subLineIndex: unknown): string {
  return `${normalizedText(piNumber, true) ?? ''}#${Number(subLineIndex)}`
}

function isSameComparisonValue(left: unknown, right: unknown): boolean {
  if (typeof left === 'number' || typeof right === 'number') {
    return left == null && right == null || left != null && right != null && Number(left) === Number(right)
  }
  return left === right
}

function changedComparisonFields(row: ParsedOrder, existing: ProductionOrder): string[] {
  const left = comparisonValues(row)
  const right = comparisonValues(existing)
  return IMPORT_COMPARISON_FIELDS.filter((field) => {
    // Missing/blank code in import does not request clearing the stored code.
    if (field === 'itemCode' && left.itemCode == null) return false
    return !isSameComparisonValue(left[field], right[field])
  })
}

function validParsedOrder(row: ParsedOrder): boolean {
  if (row.isValid === false) return false
  const pi = String(row.piNumber ?? '').trim()
  if (!pi || pi === 'CHƯA_CÓ_PI') return false

  if (row.lifecycleStatus === 'DRAFT') {
    const draftPayload = {
      ...row,
      widthM: row.widthM > 0 ? row.widthM : null,
      gsm: row.gsm > 0 ? row.gsm : null,
      color: row.color && row.color.trim() ? row.color.trim() : null,
    }
    const result = draftOrderStateSchema.safeParse(draftPayload)
    return result.success
  }
  const result = importedOrderRowSchema.safeParse(row)
  return result.success
}

/**
 * Priority for the primary planner action on a conflict row, highest first.
 * Explicit list — does NOT depend on the order the `if` branches run in.
 * INVALID is a status, not a resolution; customer ambiguity is a preview
 * banner, not a per-row resolution.
 */
const RESOLUTION_PRIORITY: OrderImportResolution[] = [
  'DUPLICATE_IN_DB',
  'DRAFT_EXISTS',
  'DUPLICATE_IN_FILE',
  'SPLIT_BY_CUSTOMER',
  'ADD_NO_TO_FILE',
  'CONTENT_DIFFERS',
]

/** Pick the highest-priority resolution, or undefined when none applies. */
export function pickResolution(
  candidates: Iterable<OrderImportResolution>,
): OrderImportResolution | undefined {
  const set = new Set(candidates)
  for (const r of RESOLUTION_PRIORITY) {
    if (set.has(r)) return r
  }
  return undefined
}

/**
 * Classifies parsed import rows without accessing the database.  The route
 * supplies the small set of existing rows for the uploaded PI numbers.
 */
export function classifyOrderImport(
  rows: ParsedOrder[],
  existing: ProductionOrder[],
): OrderImportDecision[] {
  const existingByIdentity = new Map<string, ProductionOrder[]>()
  for (const order of existing) {
    const key = importIdentity(order.piNumber, order.subLineIndex)
    const values = existingByIdentity.get(key) ?? []
    values.push(order)
    existingByIdentity.set(key, values)
  }

  const rowsByIdentity = new Map<string, number[]>()
  const rowsByPi = new Map<string, number[]>()
  // B5: push into existing arrays (O(n)) instead of spread-copy (O(n²)).
  rows.forEach((row, index) => {
    const key = importIdentity(row.piNumber, row.subLineIndex)
    const byIdentity = rowsByIdentity.get(key)
    if (byIdentity) byIdentity.push(index)
    else rowsByIdentity.set(key, [index])
    const pi = normalizedText(row.piNumber, true) ?? ''
    const byPi = rowsByPi.get(pi)
    if (byPi) byPi.push(index)
    else rowsByPi.set(pi, [index])
  })

  // B4: candidate resolutions per row; final pick happens after all branches.
  const resolutionMarks = new Map<number, Set<OrderImportResolution>>()
  const markResolution = (index: number, r: OrderImportResolution) => {
    const s = resolutionMarks.get(index) ?? new Set<OrderImportResolution>()
    s.add(r)
    resolutionMarks.set(index, s)
  }

  // B5: one normalized-PI lookup set (O(n)) instead of existing.some() per row.
  // Uses the same normalizedText() so matching rules never drift.
  const existingPiSet = new Set<string>()
  let existingHasNullPi = false
  for (const order of existing) {
    const pi = normalizedText(order.piNumber, true)
    if (pi === null) existingHasNullPi = true
    else existingPiSet.add(pi)
  }

  const decisions: OrderImportDecision[] = rows.map((row, rowIndex) => ({
    rowIndex,
    piNumber: String(row.piNumber ?? ''),
    subLineIndex: Number(row.subLineIndex),
    status: 'new',
    existingOrderId: null,
    changedFields: [],
    reasons: [],
  }))

  rowsByPi.forEach((indexes, pi) => {
    if (!pi || pi === 'CHƯA_CÓ_PI') return
    const customers = new Set(
      indexes
        .filter((index: number) => validParsedOrder(rows[index]))
        .map((index: number) => normalizedText(rows[index].customer, true)),
    )
    if (customers.size > 1) {
      indexes.forEach((index: number) => {
        if (decisions[index].status !== 'invalid') {
          decisions[index].status = 'conflict'
          decisions[index].reasons.push(`PI ${pi} xuất hiện với nhiều khách hàng trong cùng file`)
          markResolution(index, 'SPLIT_BY_CUSTOMER')
        }
      })
    }
  })

  rowsByIdentity.forEach((indexes, identity) => {
    const dbMatches = existingByIdentity.get(identity) ?? []
    const dbMatch = dbMatches.length === 1 ? dbMatches[0] : null
    const hasDbAmbiguity = dbMatches.length > 1
    const validIndexes = indexes.filter((index: number) => validParsedOrder(rows[index]))
    const firstValues = validIndexes.length > 0 ? comparisonValues(rows[validIndexes[0]]) : null
    const hasDifferentInternalRows = validIndexes.some((index: number) => {
      if (!firstValues) return false
      const current = comparisonValues(rows[index])
      return IMPORT_COMPARISON_FIELDS.some((field) => !isSameComparisonValue(firstValues[field], current[field]))
    })

    indexes.forEach((index: number) => {
      const decision = decisions[index]
      const row = rows[index]
      if (!validParsedOrder(row)) {
        decision.status = 'invalid'
        decision.reasons.push(...(row.validationErrors ?? ['Dòng không hợp lệ theo schema import']))
        return
      }

      const rowPi = normalizedText(row.piNumber, true)
      const piExistsInDb = rowPi === null ? existingHasNullPi : existingPiSet.has(rowPi)
      if (row.noWasGenerated && piExistsInDb) {
        decision.status = 'conflict'
        decision.reasons.push('NO được tự sinh nhưng PI đã tồn tại; cần chỉ rõ NO trong file')
        markResolution(index, 'ADD_NO_TO_FILE')
      }
      if (hasDbAmbiguity) {
        decision.status = 'conflict'
        decision.reasons.push('Có nhiều đơn trong DB trùng PI + NO sau khi chuẩn hóa')
        markResolution(index, 'DUPLICATE_IN_DB')
      }
      if (hasDifferentInternalRows) {
        decision.status = 'conflict'
        decision.reasons.push('Các dòng cùng PI + NO trong file có nội dung khác nhau')
        markResolution(index, 'DUPLICATE_IN_FILE')
      }
    })

    if (hasDifferentInternalRows) return

    indexes.forEach((index: number, position: number) => {
      const decision = decisions[index]
      if (decision.status === 'invalid' || decision.status === 'conflict') return
      if (dbMatch) {
        decision.existingOrderId = dbMatch.id
        const incomingCode = safeStr(rows[index].itemCode)
        const storedCode = safeStr(dbMatch.itemCode)
        if (incomingCode != null && incomingCode !== storedCode) {
          decision.itemCodeChange = { existing: storedCode, incoming: incomingCode }
        }
        if (dbMatch.isDraft) {
          decision.status = 'conflict'
          decision.reasons.push('Đơn nháp đã tồn tại; không tự phê duyệt bằng import')
          markResolution(index, 'DRAFT_EXISTS')
          return
        }
        const changedFields = changedComparisonFields(rows[index], dbMatch)
        if (changedFields.length === 0) {
          decision.status = 'identical'
          if (position > 0) decision.reasons.push('Dòng trùng hệt dòng trước trong cùng file')
        } else {
          decision.status = 'conflict'
          decision.changedFields = changedFields
          decision.reasons.push(`Nội dung khác đơn hiện tại: ${changedFields.join(', ')}`)
          markResolution(index, 'CONTENT_DIFFERS')
        }
      } else if (position === 0) {
        decision.status = 'new'
      } else {
        decision.status = 'identical'
        decision.reasons.push('Dòng trùng hệt dòng trước trong cùng file')
      }
    })
  })

  // B4: one primary action per conflict row, by explicit priority.
  decisions.forEach((decision, index) => {
    if (decision.status === 'conflict') {
      decision.resolution = pickResolution(resolutionMarks.get(index) ?? [])
    }
  })

  return decisions
}
