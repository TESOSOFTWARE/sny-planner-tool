# docs/specs/f3-schedule-bulk-import.md
# Sprint F3 — Bulk Import Production Schedule (Lịch sản xuất tháng)

## Trạng thái: ✅ PHASE A HOÀN CHỈNH — Chờ Tung xác nhận 9 edge case để build

> Tất cả số liệu bên dưới đến từ 2 script chạy thật trên file thật + DB thật (scripts đã xóa per Rule 11).

---

## Bối cảnh

Yêu cầu từ Tung: Import toàn bộ lịch máy tháng 7/2026 từ file Excel vào hệ thống SNY Planner.

**Quyết định đã chốt (Tung xác nhận 24/07/2026):**

| # | Vấn đề | Quyết định |
|---|---|---|
| Q1 | 4 PI ambiguous (nhiều sub-line) | **Skip** auto-assign, liệt kê trong báo cáo cuối, Tung gán tay sau bằng AssignFromOrderModal |
| Q2 | Tách PI khỏi description | **Dùng rule description-keyword detection** (test đã pass 64/71 PI), 7 edge case còn lại xem bảng bên dưới |
| Q3 | "SAMPLE", "SHADE NET MONO 9WALE" | **Skip** hoàn toàn — không tạo đơn nháp |
| Q4 | Filter "tháng 7" để xóa | **Overlap logic:** `startDate <= 31/07 AND endDate >= 01/07`. M-023 hiện riêng trong Preview với cảnh báo rõ |

---

## Bước 1: Thống kê thật (ĐÃ CHẠY)

**File:** `Production schedule 7 2026.xlsx` — `C:\Users\ACER\Downloads\`  
**Sheet:** `20.7.2026`

| Chỉ số | Con số |
|---|---|
| Tổng merged cell ranges trong file | 792 |
| Tổng assignment blocks | **162** |
| Tổng raw string unique trong file | 71 |
| Sau khi extract PI: PI unique hợp lệ | **64 OK + 7 cần xem (bảng dưới)** |
| PI đã tồn tại trong DB | 5 |
| PI CHƯA có → tạo đơn nháp | **~60** (chính xác sau khi resolve 7 edge case) |
| PI AMBIGUOUS (>1 sub-line) → skip, gán tay | **4** |
| MachineAssignment tháng 7 hiện trong DB | **1** (M-023 \| CVellis26-2 \| 30/06→30/07) |

### 1.1 Edge case đã resolved — 5 quyết định chốt (24/07/2026)

| Raw string trong file | PI lưu vào DB | Quyết định |
|---|---|---|
| `ITM26-1 (RO-0616) SHADE NET MONO` | **`ITM26-1`** | ✅ Strip nội dung trong `()` — đây là ref nội bộ, không thuộc PI Number |
| `ITM SHADE NET MONO` | **`ITM`** | ✅ Tạo đơn nháp — xuất hiện trong lịch thật → là PI thật dù không có year code |
| `YUNA-GVT SHADE NET MONO TAPE` | **`YUNA-GVT`** | ✅ Tạo đơn nháp — cùng lý do, format PI không bắt buộc phải có số |
| `KSSNY200 + KSSNY 201 + KSSNY 202 + KSSNY 203 - SHADE NET MONO` | **4 PI riêng:** `KSSNY200`, `KSSNY201`, `KSSNY202`, `KSSNY203` | ✅ Tạo 4 đơn nháp **và 4 MachineAssignment riêng biệt** — cùng machineId, cùng startDate/endDate với ô gốc. Không có sự mơ hồ, tách ra là xong, **KHÔNG vào danh sách gán tay** |
| `ALSHAMIL26-5+ ALSHAMIL26-4 SHADE NET MONO TAPE` | **`ALSHAMIL26-5`** + **`ALSHAMIL26-4`** | ✅ Tạo 2 đơn nháp **và 2 MachineAssignment riêng biệt** — cùng machineId, cùng startDate/endDate. **KHÔNG vào danh sách gán tay** (khác bản chất với 4 PI ambiguous ở Q1) |
| `US26-2 WINDBREAK NET` | **`US26-2`** | ✅ Thêm `WINDBREAK` vào keyword list — bị bắt nhầm vào PI trong scan trước, đã fix |
| `HBB26-1` | **`HBB26-1`** | ✅ Tạo đơn nháp bình thường |

> **Tổng hợp danh sách "cần gán tay" sau import** (liệt kê trong báo cáo cuối cho Tung):
> - JPY26-274, BH26-4, GBN26-121, GBN26-122 *(4 PI ambiguous — nhiều sub-line trong DB, không rõ gán dòng nào)*
>
> **Tổng: ĐÚNG 4 PI cần Tung gán tay sau khi import xong.**
> MULTI_PI (KSSNY200-203, ALSHAMIL26-5+26-4) không phải ambiguous — tách N assignment tự động, không cần can thiệp tay.

### 1.2 Danh sách 64 PI extract OK

| PI (clean) | Mô tả (đã tách) | Sẽ tạo nháp? |
|---|---|---|
| 26HG0602 | — | Có |
| 26HG0701 | — | Có |
| 26HG0702 | SHADE NET MONO 9WALE | Có |
| 26HN0501 | SHADE NET MONO 9WALE | Có |
| 26HN0601 | SHADE NET MONO TAPE | Có |
| 26HN0602 | SHADE NET MONO TAPE | Có |
| 26HN0701 | SHADE NET MONO TAPE | Có |
| 26KH0701 | — | Có |
| 26LCS0602 | SHADE NET MONO 9WALE | Có |
| 26LCS0603 | SHADE NET MONO | Có |
| 26LTP0602 | — | Có |
| 26LTP0701 | — | Có |
| 26LTP0702 | SHADE NET MONO 9WALE | Có |
| 26LTP0703 | — | Có |
| 26LTP0704 | — | Có |
| 26LTP0705 | — | Có |
| 26NL0701 | — | Có |
| 26NL0702 | — | Có |
| 26TC0602 | SHADE NET MONO | Có |
| 26TP0602 | SHADE NET MONO | Có |
| 26TP0702 | SHADE NET MONO 8WALE | Có |
| 26VTTP0601 | SHADE NET MONO | Có |
| ALROBOOA26-4 | SHADE NET MONO | Có |
| ALROBOOA26-5 | SHADE NET MONO | Có |
| ALROBOOA26-6 | SHADE NET MONO 8WALE | Có |
| ALSHAMIL26-4 | SHADE NET MONO TAPE | Có |
| ALSHAMIL26-5 | SHADE NET MONO TAPE | Có |
| BH26-4 | — | **Không** (ambiguous, skip) |
| COSIO26-8 | KIWI WINDBREAK NET 6WALE | Có |
| COSIO26-9 | KIWI WINDBREAK NET 6WALE | Có |
| CVellis26-2 | GRAIN NET 8WALE | **Không** (đã có trong DB, 1 sub-line → auto-link) |
| DLT26-4 | SHADE NET MONO TAPE | Có |
| DLT26-5 | SHADE NET MONO TAPE | Có |
| DLT26-6 | SHADE NET MONO TAPE | Có |
| FARAH26-3 | SHADE NET MONO TAPE | Có |
| GBN26-110 | — | Có |
| GBN26-117 | — *(note: raw là "GBN 26-117", collapse space)* | Có |
| GBN26-121 | — | **Không** (ambiguous, skip) |
| GBN26-122 | — | **Không** (ambiguous, skip) |
| GROMAX26-2 | DIAMOND BIRD NET (2 spec khác nhau) | Có |
| HBB26-1 | — | Có |
| HVG26-3 | SHADE NET MONO | Có |
| IWN26-121 | SHADE NET MONO TAPE | Có |
| IWN26-161 | SHADE NET MONO TAPE | Có |
| JPY26-274 | — | **Không** (ambiguous, skip) |
| KSSNY204 | SHADE NET MONO 8WALE | Có |
| LANDSKROON26-2 | — | Có |
| LOWS26-3 | SHADE NET MONO | Có |
| POWERPAK26-2 | FENCE NET / SHADE NET MONO 50% (2 loại) | Có |
| RICKY26-3 | SHADE NET MONO 10WALE | Có |
| SCNETTING26-1 | HAIL GUARD NET | Có |
| UC26-3 | QUAD HAIL NET | Có |
| UC26-4 | QUAD HAIL NET 8WALE | Có |
| US26-2 | (xuất hiện 3 variant + 1 windbreak lỗi) | Có (1 đơn nháp duy nhất) |
| VGC26-4 | QUAD HAIL NET | Có |
| WD26091 | SHADE NET MONO 9WALE | Có |

### 1.3 Khổ máy (MachineSpec — dữ liệu cho Sprint D)

40 máy đều có giá trị. Raw có `\n` embedded → cần `parseFloat(raw.replace(/[^\d.]/g, ''))`.

M-001: 6.85m | M-002: 6.56m | M-003: 6.85m | M-004: 6.85m | M-005: 6.85m | M-006: 4.6m | M-007: 6.85m | M-008: 6.85m | M-009: 4.45m | M-010: 6.8m | M-011: 6.58m | M-012: 4.34m | M-013: 4.4m | M-014: 6.8m | M-015: 4.7m | M-016: 4.2m | M-017: 6.8m | M-018: 4.25m | M-019: 6.8m | M-020: 6.8m | M-021: 7.85m | M-022: 6.85m | M-023: 6.85m | M-024: 6.5m | M-025: 6.80m | M-026: 6.85m | M-027: 6.3m | M-028: 6.8m | M-029: 6.8m | M-030: 6.8m | M-031: 6.0m | M-032: 6.8m | M-033: 6.8m | M-034: 6.8m | M-035: 6.8m | M-036: 6.8m | M-037: 6.8m | M-038: 6.8m | M-039: 6.8m | M-040: 6.8m

---

## Bước 2: Thiết kế kỹ thuật (Chờ confirm 9 edge case)

> Phần này chờ Tung xác nhận bảng 7 edge case ở mục 1.1 rồi hoàn thiện.

### 2.1 Schema thay đổi

```prisma
// Model Mới — lưu thông số dàn máy (Sprint F3 + Sprint D)
model MachineSpec {
  machineId String  @id            // "M-001" to "M-040"
  widthM    Float                  // khổ máy (m) — từ col A file lịch
  updatedAt DateTime @updatedAt
  @@map("machine_specs")
}
// Thêm vào ProductionOrder: KHÔNG thay đổi schema (đơn nháp dùng cơ chế Sprint F1 sẵn có)
```

### 2.2 Logic parser (FINAL — tất cả edge case đã resolved)

```typescript
// Keyword list đầy đủ (bao gồm WINDBREAK — fix từ scan thật)
const DESCRIPTION_KEYWORDS = [
  'SHADE', 'FENCE', 'BIRD', 'HAIL', 'WINDBREAK', 'GUARD', 'GRAIN',
  'DIAMOND', 'HEX', 'QUAD', 'KIWI', 'DEBRIS', 'SCAFFOLDING',
  'MONO', 'TAPE', 'BODY', 'EDGE',
]

// Các raw string skip hoàn toàn (Q3 — không tạo đơn nháp)
const SKIP_EXACT = ['SAMPLE', 'SHADE NET MONO 9WALE']
const SKIP_PREFIX = ['SAMPLE '] // e.g. "SAMPLE FOR RICKY..."

function extractPiFromRaw(raw: string): string[] {
  const s = raw.trim().replace(/\s+/g, ' ')  // normalize whitespace

  // 1. Skip hoàn toàn
  if (SKIP_EXACT.includes(s)) return []
  if (SKIP_PREFIX.some(p => s.startsWith(p))) return []
  if (!s || s.toLowerCase() === 'off') return []

  // 2. Strip nội dung trong ngoặc đơn — ref nội bộ không thuộc PI
  //    e.g. "ITM26-1 (RO-0616) SHADE NET" → "ITM26-1 SHADE NET"
  const stripped = s.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()

  // 3. Tách phần PI khỏi description
  //    Tìm vị trí đầu tiên của description keyword
  const words = stripped.split(' ')
  let descStartIdx = words.length
  for (let i = 1; i < words.length; i++) {
    const w = words[i].toUpperCase()
    if (
      DESCRIPTION_KEYWORDS.includes(w) ||
      /^\d+(WALE|MM)$/.test(w) ||
      w === 'NET'
    ) {
      descStartIdx = i
      break
    }
  }
  const candidatePart = words.slice(0, descStartIdx).join(' ').trim()

  // 4. Multi-PI: ô chứa nhiều PI nối bằng "+"
  //    e.g. "KSSNY200 + KSSNY201 + KSSNY202 + KSSNY203"
  //    e.g. "ALSHAMIL26-5+ ALSHAMIL26-4"
  if (candidatePart.includes('+')) {
    const parts = candidatePart
      .split('+')
      .map(p => p.trim().replace(/[-\s]+$/, '').trim())
      .filter(p => p.length > 0 && /\S/.test(p))
    // Clean mỗi phần: normalize space giữa brand+year (GBN 26-117 → GBN26-117)
    return parts.map(normalizePiCode).filter(p => p.length > 0)
  }

  // 5. Single PI
  const normalized = normalizePiCode(candidatePart)
  return normalized ? [normalized] : []
}

function normalizePiCode(candidate: string): string {
  let p = candidate.trim().replace(/[-+,\s]+$/, '').trim() // strip trailing punct

  // Collapse "GBN 26-117" (brand SPACE year-dash-num) → "GBN26-117"
  p = p.replace(/^([A-Za-z]+)\s+(\d{2}-\d+)$/, '$1$2')
  // Collapse "GBN 26" (brand SPACE 2-digit-year) → "GBN26"
  p = p.replace(/^([A-Za-z]+)\s+(\d{2})$/, '$1$2')
  // Collapse "KSSNY 201" → "KSSNY201"
  p = p.replace(/^([A-Za-z]+)\s+(\d+)$/, '$1$2')

  return p
}

// Xử lý MULTI_PI — quyết định đã chốt:
// - Tạo đơn nháp cho TẤT CẢ PI trong ô
// - Tạo N MachineAssignment riêng biệt — cùng machineId, cùng startDate/endDate
// - KHÔNG đẩy PI nào vào danh sách "cần gán tay"
// - Đây KHÁC với 4 PI ambiguous (Q1): không có sự mơ hồ nào, tách là xong
function processMultiPiCell(
  rawPis: string[],
  machineId: string,
  startDate: Date,
  endDate: Date
): { assignments: { piNumber: string; machineId: string; startDate: Date; endDate: Date }[] } {
  return {
    assignments: rawPis.map(pi => ({ piNumber: pi, machineId, startDate, endDate })),
  }
}
```

### 2.3 Import flow

```
Upload file → Preview API (parse only) → Preview UI → Confirm → Transaction
```

#### Preview API (`POST /api/schedule/import/preview`)
- Parse file, extract PI + dates + machineIds + machineWidths
- Check DB: PI nào đã có (link orderId), PI nào mới (sẽ tạo nháp), PI nào ambiguous (skip)
- Trả về:
  ```json
  {
    "toDelete": [{ id, machineId, piNumber, startDate, endDate }],       // assignments tháng 7 hiện có
    "borderlineAssignments": [...],                                        // M-023 overlap 30/6
    "toCreateDraftOrders": ["PI-A", "PI-B", ...],                         // PI mới
    "toCreateAssignments": [{ machineId, piNumber, orderId?, startDate, endDate }],
    "skippedAmbiguous": ["JPY26-274", "BH26-4", "GBN26-121", "GBN26-122"],
    "skippedInvalid": ["SAMPLE", "SHADE NET MONO 9WALE", ...],
    "machineSpecs": [{ machineId, widthM }],
    "summary": { deleteCount, createCount, draftCount, ambiguousCount }
  }
  ```

#### Preview UI
- Hiển thị 4 sections:
  1. **Sẽ xóa X assignments cũ** (danh sách có thể collapse)
  2. **Cần xem tay (M-023 borderline)** — checkbox "Xóa assignment này không?"
  3. **Sẽ tạo Y assignments mới** (có/không có PI mới đi kèm)
  4. **4 PI bỏ qua (ambiguous)** — nhắc Tung gán tay sau

- Nút **"Xác nhận Import"** chỉ enable sau khi Tung đã xem qua cả 4 sections

#### Confirm API (`POST /api/schedule/import/confirm`)
- Nhận payload từ Preview (kèm quyết định về M-023)
- Một transaction duy nhất:
  1. **Backup:** insert toàn bộ `toDelete` vào bảng `ScheduleImportLog` (audit trail, không xóa thật)
  2. **Xóa** assignments theo filter overlap (`startDate <= 31/07 AND endDate >= 01/07`), có/không có M-023 tuỳ Tung chọn
  3. **Tạo đơn nháp** (bulk insert) cho các PI mới:
     ```typescript
     // Customer bắt buộc phải set — file nguồn không có thông tin khách hàng
     // Dùng giá trị sentinel để phân biệt với đơn nháp tạo thủ công
     {
       piNumber:   piCode,
       customer:   'Chưa xác định (import từ lịch máy)',  // ← BẮT BUỘC, không để trống
       isDraft:    true,
       dataSource: 'import',
       subLineIndex: 0,  // mỗi PI từ file = 1 sub-line duy nhất
     }
     ```
     > **Lý do set customer sentinel:** validation hiện tại bắt buộc `customer` không được rỗng (cả đơn nháp). File lịch máy không có thông tin KH → dùng string sentinel để planner biết cần cập nhật sau khi Duyệt đơn.
  4. **Insert** assignments mới (PI[0] cho ô multi-PI)
  5. **Upsert** `MachineSpec` 40 máy
  6. **Trả về** báo cáo cuối:
     ```json
     {
       "imported": { "deleted": N, "created": M, "draftsCreated": K },
       "needsManualAssignment": [
         "JPY26-274", "BH26-4", "GBN26-121", "GBN26-122"
       ]
     }
     ```
     *(MULTI_PI đã được tạo assignment tự động — không xuất hiện ở đây)*
- Lỗi giữa chừng → rollback toàn bộ (không xóa, không insert, không tạo nháp)

### 2.4 An toàn backup

**Không cần export file JSON riêng** — dùng `ScheduleImportLog` table:

```prisma
model ScheduleImportLog {
  id          String   @id @default(cuid())
  importedAt  DateTime @default(now())
  backupData  Json     // toàn bộ MachineAssignment bị xóa, dạng JSON
  summary     Json     // summary count
  @@map("schedule_import_logs")
}
```

Ưu điểm: backup ngay trong transaction, nếu tx fail → không mất gì cả. Nếu cần rollback manual sau này → Tung query bảng này.

### 2.5 Files cần tạo/sửa

| File | Thao tác | Ghi chú |
|---|---|---|
| `prisma/schema.prisma` | MODIFY | Thêm `MachineSpec`, `ScheduleImportLog` |
| `src/lib/excel/parseScheduleReport.ts` | NEW | Parser merged cells, PI extraction |
| `src/app/api/schedule/import/route.ts` | NEW | POST preview |
| `src/app/api/schedule/import/confirm/route.ts` | NEW | POST confirm + transaction |
| `src/components/schedule/ImportScheduleModal.tsx` | NEW | 3-step modal (upload → preview → confirm) |
| `src/app/schedule/page.tsx` | MODIFY | Thêm "Import Lịch tháng" button |

---

## Bước 3: Risk & Edge Cases

| Rủi ro | Mức | Xử lý |
|---|---|---|
| 4 PI ambiguous gán sai sub-line | 🔴 CAO | Skip, Tung gán tay sau |
| M-023 (30/6→30/7) bị xóa nhầm | 🔴 CAO | Hiện riêng trong Preview, Tung chọn tay |
| PI name có khoảng trắng (`GBN 26-117`) | 🟡 TRUNG | Collapse regex: `([A-Z]+) (26-\d+)` → `GBN26-117` |
| PI name dài + description lẫn (`Cvellis26-2 - GRAIN...`) | 🟡 TRUNG | Keyword detection đã handle |
| Multi-PI trong 1 ô | 🟡 TRUNG | [chờ Q2 edge case] |
| `@@unique([machineId, startDate])` conflict | 🟡 TRUNG | Transaction: xóa trước → insert sau |
| Sheets khác nhau (file có 10 sheets) | 🟢 THẤP | UI cho phép Tung chọn sheet |

---

## Trạng thái Phase A: ✅ ĐẦY ĐỦ — Sẵn sàng build Phase B

Tất cả edge case đã resolved. Không còn open question.

**Cần build (theo thứ tự):**
1. `prisma/schema.prisma` — thêm `MachineSpec` + `ScheduleImportLog` + migration
2. `src/lib/excel/parseScheduleReport.ts` — parser với logic 2.2 ở trên
3. `src/app/api/schedule/import/route.ts` — Preview API
4. `src/app/api/schedule/import/confirm/route.ts` — Confirm API + transaction
5. `src/components/schedule/ImportScheduleModal.tsx` — 3-step modal UI
6. `src/app/schedule/page.tsx` — thêm button "Import Lịch tháng"
7. `npm run build` — verify 0 lỗi trước khi báo done
