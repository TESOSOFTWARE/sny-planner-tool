# E1 Extruder Daily Output — Implementation Plan

## Goal

Thêm module mới **Extruder Daily Output** vào trang `/materials`:
- Parse file Excel SNY (sheet `EXTRUDER`) chứa sản lượng kéo sợi hàng ngày theo từng máy đùn.
- Lưu vào DB model `ExtruderDailyOutput`.
- Hiển thị bảng dữ liệu, filter theo máy, nút Tải mẫu + Import.
- Tích hợp vào tab bar hiện tại của trang Materials (cạnh HDPE / Masterbatch / Korea).

**Out of scope sprint này:**
- Không tính formula MF/UV/FR từ sản lượng.
- Không link với `ProductionOrder`.
- Không tự động tính ETA hoàn thành.

---

## File Tree

### New files

```
prisma/
  schema.prisma                              ← [MODIFY] thêm model ExtruderDailyOutput

src/lib/excel/
  parseExtruderReport.ts                     ← [NEW] parser sheet EXTRUDER

src/app/api/extruder/
  import/route.ts                            ← [NEW] POST preview (no DB write)
  import/confirm/route.ts                    ← [NEW] POST upsert to DB
  records/route.ts                           ← [NEW] GET list (filter by date, machineId)
  template/route.ts                          ← [NEW] GET download template .xlsx

src/components/materials/
  ImportExtruderModal.tsx                    ← [NEW] 3-step modal (upload → preview → confirm)
  ExtruderTab.tsx                            ← [NEW] tab UI (bảng + filter + header)

src/app/materials/page.tsx                  ← [MODIFY] thêm tab EXTRUDER vào tab bar
```

### Modified files summary
| File | Thay đổi |
|---|---|
| `prisma/schema.prisma` | Thêm model `ExtruderDailyOutput` |
| `src/app/materials/page.tsx` | Thêm tab `EXTRUDER`, import `ExtruderTab` + `ImportExtruderModal`, state `showExtruderModal` |

---

## Prisma Model

```prisma
model ExtruderDailyOutput {
  id         String   @id @default(cuid())
  machineId  String   // "EXT-01", "EXT-02"... KHÔNG trùng M-001..M-040 (đó là máy dệt)
  reportDate DateTime // UTC midnight, giống parser Knitting đã làm (UTC-safe)
  shift      String   // "D" (ca ngày) hoặc "N" (ca đêm)
  color      String   // vd "BLACK B045 UV 2%"
  denier     Decimal? @db.Decimal(10, 2)
  weightKgs  Decimal  @db.Decimal(10, 2)
  remark     String?  // mã đơn hàng liên quan (vd "PI-2026-001, PI-2026-002")
  dataSource String   @default("import")
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([machineId])
  @@index([reportDate])
  @@map("extruder_daily_output")
}
```

**Lý do không có `@@unique([machineId, reportDate, shift, color])`:**
Mỗi máy trong 1 ngày có thể có nhiều dòng (nhiều màu, nhiều ca), không nên unique trên composite key quá nhiều cột. Import theo file sẽ dùng **delete-then-insert** theo `[machineId, reportDate]` hoặc insert-only. Xem Step 7 bên dưới.

---

## Parser Design (`parseExtruderReport.ts`)

### Cấu trúc file Excel thực tế
```
Row 1-3: tiêu đề chung + ngày báo cáo (vd "20-07-2026")
         Ngày ở dòng đầu dạng text "2026-07-20" hoặc "20-21/7" hoặc serial number
         → Dùng heuristic: scan 5 dòng đầu, tìm cell chứa date-like pattern

Block máy:
  Row tiêu đề block:  "1st EXTRUDER MACHINE" / "2nd EXTRUDER MACHINE"...
                       → đây là marker bắt đầu block máy mới
                       → machineId = "EXT-01", "EXT-02"...

  Dòng dữ liệu: [NO] [COLOR] [DENIER] [WEIGHT] [TOTAL] [REMARK]
                 NO = "D" hoặc "N"
                 COLOR = string tên màu
                 DENIER = số (nullable)
                 WEIGHT = số kg
                 TOTAL = có thể trùng WEIGHT hoặc là total ca
                 REMARK = mã đơn hàng (comma-separated)

  Dòng TOTAL của block: NO = "TOTAL" → skip (không import)
```

### Date parsing (UTC-safe, tương tự Knitting)
- `cellDates: false, raw: true` — giống Knitting parser.
- Scan 5 dòng đầu: nếu cell là **Excel serial number** → dùng `serialToDate()`.
- Nếu cell là **string** dạng `"2026-07-20"` hoặc `"20/07/2026"` → parse thủ công.
- Fallback: nếu không tìm được ngày → throw Error (không guess).

### Machine ID mapping
```
"1st EXTRUDER" → "EXT-01"
"2nd EXTRUDER" → "EXT-02"
...
Regex: /(\d+)(st|nd|rd|th)\s+EXTRUDER/i → lấy số → format "EXT-XX"
```

---

## Implementation Steps (10 steps, mỗi step verify được)

### Step 1 — Schema migration
**File:** `prisma/schema.prisma`
- Thêm model `ExtruderDailyOutput` như trên.
- Chạy `npx prisma db push`.
- **Verify:** `npx prisma studio` hoặc psql confirm table `extruder_daily_output` tồn tại.

### Step 2 — Parser
**File:** `src/lib/excel/parseExtruderReport.ts`
- Export interface `ExtruderRow { machineId, reportDate, shift, color, denier, weightKgs, remark }`.
- Export function `parseExtruderReport(buffer: Buffer): ExtruderRow[]`.
- UTC-safe date handling (reuse `serialToDate()` pattern từ Knitting).
- Skip dòng TOTAL, skip dòng trống.
- **Verify:** Unit test bằng file `20-21_7.xlsx` → xem log output rows.

### Step 3 — Import preview API
**File:** `src/app/api/extruder/import/route.ts`
- `POST /api/extruder/import` — nhận `.xlsx` upload.
- Parse với `parseExtruderReport()`.
- Trả về preview: `{ totalRecords, dates, machines, rows }` (không write DB).
- File size limit 20 MB.
- **Verify:** `curl -X POST` với file thật → check response JSON.

### Step 4 — Import confirm API
**File:** `src/app/api/extruder/import/confirm/route.ts`
- `POST /api/extruder/import/confirm` — nhận `{ rows: ExtruderRow[] }`.
- Dùng `prisma.$transaction` để batch-insert.
- **Không upsert** — một ngày import lại sẽ thêm records mới (dữ liệu gốc giữ nguyên). Nếu cần idempotent thì cần thêm unique constraint sau.
- **Verify:** Import xong, query DB `SELECT COUNT(*) FROM extruder_daily_output`.

### Step 5 — Records GET API
**File:** `src/app/api/extruder/records/route.ts`
- `GET /api/extruder/records?date=2026-07-20&machineId=EXT-01` (params optional).
- Trả về list records, sắp xếp theo `reportDate desc, machineId asc`.
- **Verify:** GET sau import → check data đúng.

### Step 6 — Template download API
**File:** `src/app/api/extruder/template/route.ts`
- `GET /api/extruder/template` — tạo và trả về file `.xlsx` template.
- Header: `DATE | MACHINE | NO | COLOR | DENIER | WEIGHT | REMARK`.
- **Verify:** Download file, mở bằng Excel.

### Step 7 — Import Modal
**File:** `src/components/materials/ImportExtruderModal.tsx`
- 3-step modal: upload → preview → confirm. Pattern giống `ImportKnittingModal.tsx`.
- Preview hiển thị: số records, danh sách máy tìm thấy, danh sách ngày.
- **Verify:** Test upload file → thấy preview đúng → confirm → success.

### Step 8 — ExtruderTab component
**File:** `src/components/materials/ExtruderTab.tsx`
- Bảng hiển thị records từ API.
- Filter theo ngày (date picker) + machineId (dropdown).
- Header actions: `[Tải mẫu] [Import]`.
- Summary cards: Total records, Tổng sản lượng (kg), Số máy.
- **Verify:** Sau import thấy dữ liệu trong bảng.

### Step 9 — Tích hợp vào trang Materials
**File:** `src/app/materials/page.tsx`
- Thêm `'EXTRUDER'` vào tab bar (tab thứ 4).
- Import `ExtruderTab` + `ImportExtruderModal`.
- Thêm state `showExtruderModal`.
- Khi `activeTab === 'EXTRUDER'` → render `<ExtruderTab>`.
- **Verify:** Chuyển tab thấy UI Extruder.

### Step 10 — tsc --noEmit + end-to-end
- Chạy `npx tsc --noEmit` → 0 errors.
- Import file `20-21_7.xlsx` từ đầu đến cuối.
- Kiểm tra số rows DB khớp với số dòng không phải TOTAL trong file.
- **Verify:** Tung confirm số liệu đúng.

---

## Risks

| Risk | Xác suất | Mức độ | Mitigation |
|---|---|---|---|
| Format file Excel thay đổi theo ngày (header khác) | Cao | Cao | Parser dùng keyword matching linh hoạt, không hardcode column index; throw rõ ràng khi không match |
| Date parsing sai (serial vs text vs locale format) | Trung bình | Cao | Multi-format fallback; nếu không parse được → throw, không guess |
| Block máy không bắt đầu từ "1st EXTRUDER" | Trung bình | Trung bình | Regex khớp nhiều pattern: "EXTRUDER MACHINE", "EXTRUDER 1", "1ST EXTRUDER" |
| Column offset khác nhau giữa block (HDPE vs MB style) | Thấp | Trung bình | Detect header row trong mỗi block |
| File có sheet tên khác (không phải "EXTRUDER") | Thấp | Cao | Fuzzy match: tìm sheet có tên chứa "EXTRUDER", nếu không có throw với danh sách available sheets |

---

## Manual Tests (Tung phải chạy)

1. **Upload file `20-21_7.xlsx`** → Preview → Confirm → Check DB:
   - Số records import = số dòng dữ liệu (không phải TOTAL) trong sheet EXTRUDER
   - TOTAL từng máy trong file == SUM(weightKgs) cho máy đó trong DB theo ngày

2. **Check trùng ngày**: Import lại cùng file → records thêm vào (không ghi đè) — xác nhận behavior này là expected hoặc cần thêm "delete trước khi import lại" nếu Loan muốn idempotent.

3. **Filter UI**: Chọn một ngày cụ thể → chỉ thấy records ngày đó. Chọn máy cụ thể → đúng rows.

4. **Tab switching**: Click tab EXTRUDER từ trang `/materials` → UI hiện đúng, không crash.

5. **Template download**: Click "Tải mẫu" → file `.xlsx` tải về, mở được bằng Excel.

---

## Open Questions

> [!IMPORTANT]
> Cần Tung xác nhận trước khi build:

1. **Idempotent import**: Nếu import lại cùng file (cùng ngày), bạn muốn:
   - **Option A**: Thêm records mới (có thể duplicate) — đơn giản nhất
   - **Option B**: Delete records cũ của ngày đó rồi insert lại — idempotent, sạch hơn
   - **Recommendation: Option B** (delete-then-insert theo `[machineId, reportDate]`)

2. **File test `20-21_7.xlsx`**: File này cover ngày 20/7 và 21/7, hay chỉ 1 ngày? (Ảnh hưởng đến expected record count khi verify)

3. **Số máy Extruder**: File thực tế có bao nhiêu máy? (1st, 2nd, 3rd, hay nhiều hơn?) — Để estimate record count khi test.

---

## Out of Scope (Sprint này)

- ❌ Tính formula MF/UV/FR từ sản lượng Extruder
- ❌ Link `ExtruderDailyOutput` với `ProductionOrder`
- ❌ Auto ETA hoàn thành từ extruder output
- ❌ Warping / Rolling tracking (sprint khác)
- ❌ Chart / visualization
