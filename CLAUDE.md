# CLAUDE.md — SNY Planner Tool
> Ground truth for all AI coding agents (Antigravity, Cursor).
> READ THIS ENTIRE FILE before generating any code.
> If context in this file conflicts with your judgment → this file wins.
> Last sprint DONE: Import Rolling & Đóng gói (Sprint J1 & J2) ✅
> Next sprint pending: Customer Management UI & Materials refinement

---

## 1. Project & roles
- **Project name:** SNY Planner Tool
- **Client:** SNY VINA — PP mesh factory, Vietnam. Website: snyvina.net.co
- **Vendor:** TESO. **Dev:** Tung — PM + direct builder via Antigravity.
- **Pipeline:** Claude (plan/review) → Antigravity + Gemini 3 Pro (build) → Cursor (review + commit GitHub) → Vercel (deploy)
- **Repo:** https://github.com/tungtttruongg-tech/sny-planner
- **Database:** Neon.tech PostgreSQL (Singapore region)
- **Live URL:** https://sny-planner.vercel.app
- **Tagged:** v1.0-phase1-complete

---

## 2. System goal (TO-BE)
Replace 4 disconnected Excel files with 1 system.
Flow: Sales Order → Production Order → Machine Schedule → Material Planning.

**Phase 1 (DONE):** Endusers enter data into tool. Stop using Excel.
**Last sprint DONE:** Order Journey (Sprint G1-G3) ✅
**Next sprints (Must have trước G3 24-27/7):** Customer Management UI & Materials refinement.
**Phase 2 (later):** AI automation, auto-scheduling, formula calculations, alerts.

---

## 3. What is already built — DO NOT rebuild

### S0 ✅ Scaffold
- Next.js 14 App Router + TypeScript + Tailwind
- Prisma 5.22.0 + Neon PostgreSQL
- `.env` + `.env.local` with DATABASE_URL

### S1 ✅ Order list
- `src/app/orders/page.tsx` — server component, KPI cards, table
- `src/components/orders/OrderTable.tsx` — search by PI/Customer

### S2 ✅ New order form — MERGED into multi-line form (BREAKING CHANGE 24/06/2026)
- **`src/app/orders/new/` REMOVED** — page deleted entirely
- **`src/components/orders/NewOrderForm.tsx` DELETED** — do not recreate
- **`src/app/orders/new-multi/page.tsx`** is now the ONLY order creation page
- **`src/components/orders/MultiLineOrderForm.tsx`** handles 1 or many sub-lines:
  - **Shared fields** (top card, apply to all lines): PI Number, Customer, Order Date, GSM, MB Code, Mesh Type, Needle Count, Beam Count, Description, Remark
  - **Per-line fields** (repeatable rows, start with 1): Color, Width (m), Order Type + conditional fields (see below), UV%, FR checkbox, Eyelet checkbox + Eyelet Color
  - **Conditional per orderType:** `meters` → Length (m) | `rolls` → Số cuộn + Mét/cuộn | `pieces` → Số tấm + Chiều dài tấm
  - Each row auto-calculates and displays live: **Tổng mét** + **Trọng lượng ước tính (kg)**
  - "+ Thêm dòng" button adds rows; "Xoá dòng" removes (disabled when only 1 row)
- **`src/app/api/orders/multi-line/route.ts`** — POST handler:
  - Prisma `$transaction` — all-or-nothing create of all sub-lines
  - `subLineIndex` auto-assigned, continuing from highest existing index for that PI
  - Calculates `qtySqm` + `totalWeightKgs` per line using `calculateOrderWeight()`
  - Sets `dataSource: "manual"` on every created record
- "New order" button on `/orders` page links to `/orders/new-multi`
- `src/app/api/orders/route.ts` POST handler still exists but is no longer linked from UI (kept to avoid breaking anything)

### S3 ✅ Order detail
- `src/app/orders/[id]/page.tsx`
- `src/components/orders/OrderDetail.tsx` — VIEW + EDIT + DELETE
  - View mode: shows `totalWeightKgs` when not null
  - Edit mode: live `editEstimatedWeight` chip updates as fields change
- `src/app/api/orders/[id]/route.ts` — GET/PATCH/DELETE
  - PATCH recalculates `qtySqm` + `totalWeightKgs` if any dimension/type field changed

### S4 ✅ Mock pages
- Replaced by real pages in M2/M3

### S5 ✅ Excel import
- `src/app/api/orders/import/route.ts` — parse preview
- `src/app/api/orders/import/confirm/route.ts` — full file import, sets `dataSource: "import"`
- `src/components/orders/ImportOrdersModal.tsx`
- `src/lib/excel/parseOrderList.ts`

### R1 ✅ UI Redesign (Korean minimal light theme)
- `src/app/layout.tsx` — top nav + side nav structure
- `src/components/layout/TopNav.tsx` — fixed 64px top nav
- `src/components/layout/SideNav.tsx` — fixed 280px side nav, all items → /orders
- `tailwind.config.ts` — full design system tokens
- Light theme: background #fbf9f8, primary navy #002444

### Bulk Paste ✅
- `src/app/orders/bulk/page.tsx` — paste from Excel → preview → import
- `src/app/api/orders/bulk/route.ts` — POST handler, sets `dataSource: "import"`
- `src/lib/excel/parsePastedText.ts` — tab-separated parser

### M2 ✅ Machine Schedule functional
- Grid 40×days, assign/edit/remove, overlap check UTC+7.
- `AssignFromOrderModal`: assign from order detail page.

### Multi-machine assignment ✅
- 1 order can run on multiple machines simultaneously (orderId no longer `@unique`).
- `allocatedMeters` field tracks meters per assignment — default 50/50 split.
- OrderDetail page shows "MÁY ĐANG CHẠY" section listing all assignments.
- `AssignFromOrderModal` pre-fills `allocatedMeters` with `order.lengthM / 2`.

### Schedule DetailModal — full order details ✅
- Clicking an assigned cell shows: Width, Length, GSM, Color, MB Code, Qty, Mesh Type, Needle Count, Eyelet, Eyelet Color, Allocated Meters, **Trọng lượng (kg)**.

### M3 ✅ Materials functional
- CRUD inventory, low stock alerts, summary cards.
- Status badge: **"Chưa đặt ngưỡng"** (grey) when `minThreshold` is null.

### Material Transaction system ✅
- `src/components/materials/AddTransactionModal.tsx` — manual IN/OUT entry with optional MB% field.
- `src/components/materials/TransactionHistoryModal.tsx` — history per material, delete per row.
- `src/app/api/materials/[id]/transactions/route.ts` — GET history, POST new transaction (atomic stock update).
- `src/app/api/materials/[id]/transactions/[txId]/route.ts` — DELETE (reverses stock impact atomically).

### Material Excel Import ✅
- `src/lib/excel/parseMaterialReport.ts` — parses SNY daily HDPE/MB report (FIRST STOCK | IN | HDPE BROKEN | OUT TAPE | REJECT | OUT USING | LAST STOCK).
- `src/components/materials/ImportMaterialReportModal.tsx` — 3-step: upload .xlsx → preview matched/new → confirm.
- `src/app/api/materials/import-transactions/route.ts` — preview only, no DB write.
- `src/app/api/materials/import-transactions/confirm/route.ts` — creates `MaterialTransaction` records, sets `currentStock = lastStock` (file is source of truth), auto-creates unmatched materials with `minThreshold = null`.

### Calculated weight fields ✅
- `qtySqm`, `totalWeightKgs`, `requiredYarnKg` — auto-calculated on every create/update using `src/lib/calculations/orderWeight.ts`
- **Formula (Case A & Sprint I2):**
  - `qtySqm = widthM × totalMeters`
  - `totalWeightKgs = qtySqm × gsm / 1000` (Trọng lượng hiển thị PO cho khách — KHÔNG ĐỔI)
  - `requiredYarnKg = (qtySqm × (productionGsm ?? gsm) / 1000) × 1.05` (Nhu cầu sợi nội bộ — dùng `productionGsm` nếu có, fallback `gsm` gốc)
- `totalMeters` depends on `orderType`:
  - `"meters"` → `totalMeters = lengthM`
  - `"rolls"`  → `totalMeters = qty × rollLength`
  - `"pieces"` → `totalMeters = qty × pieceLength`
- Displayed **live** in: `MultiLineOrderForm` (per row), `OrderDetail` view + edit mode, Schedule `DetailModal`
- Set on: `POST /api/orders/multi-line`, `POST /api/orders` (legacy), `PATCH /api/orders/[id]`, `POST /api/orders/[id]/approve`
- **Backfill:** `scripts/backfill-qtysqm.ts` — đã chạy 1 lần (30/06/2026), cập nhật qtySqm + totalWeightKgs cho 113 đơn lịch sử nhập trước khi tính năng tồn tại. Giữ lại trong repo làm audit trail. **KHÔNG chạy lại** trừ khi phát hiện thêm đơn thiếu qtySqm tương tự.

### PO Summary + Output Input ✅
- `src/app/orders/summary/page.tsx` — server component, group orders theo piNumber
- `src/components/orders/POSummaryTable.tsx` — client component: expand/collapse per PI, search PI/Customer, cảnh báo ⚠ (icon + native `title` tooltip) khi 1 piNumber có ≥2 customer khác nhau. **KHÔNG gộp tên customer trong header** — chỉ hiện `customers[0]` + icon cảnh báo.
- `MachineAssignment.estimatedDailyOutput` (Decimal?, nullable) — planner nhập tay khi assign PO vào máy qua `AssignModal.tsx` / `AssignFromOrderModal.tsx`. Hiển thị trong `DetailModal.tsx`. **Input only — KHÔNG có logic tính toán tự động từ field này.**
- `OrderDetail.tsx` view mode: bổ sung hiển thị `qtySqm` ("Diện tích (m²)") + `dataSource` ("Nguồn dữ liệu") — tất cả field trong DB đã được surface đầy đủ.
- "PO Summary" button thêm vào `/orders` page header (outline style, giữa Bulk paste và New order).

### Knitting Daily Output ✅
- `src/lib/excel/parseKnittingReport.ts` — parser sheet KNITTING từ STATISTICAL REPORT file.
  - Đọc col I (index 8) từ TOTAL row cho `dailyMeters` (đã là sản lượng ngày, không phải cumulative)
  - Date từ col O (index 14) dạng **Excel serial number** → `serialToDate()` tính UTC math trực tiếp.
    **KHÔNG dùng JS Date object** — tránh timezone issue (SheetJS UTC vs UTC+7 offset).
  - 1 file có thể chứa nhiều ngày; chỉ reset `currentDate` khi gặp `'MACHINE 1'` header.
  - MACHINE 2→40 header rows bị skip (không reset date, không emit record).
- `src/app/api/knitting/import/route.ts` — preview POST (parse only, no DB write)
- `src/app/api/knitting/import/confirm/route.ts` — confirm POST, upsert theo `[machineId, reportDate]`.
  `dailyMeters` lưu thẳng từ col I, không tính delta. `cumulativeMeters` = same value (field giữ cho schema compat).
- `src/app/api/knitting/progress/[orderId]/route.ts` — GET `producedMeters`, `remainingMeters`,
  `avgDailyOutput` (avg 7 ngày gần nhất > 0), `remainingDays`.
- `src/components/materials/ImportKnittingModal.tsx` — 3-step modal (pick → preview → confirm),
  hiển thị ngày tìm thấy + số records trước khi confirm.
- `src/app/materials/page.tsx` — thêm "Import Knitting Report" button.
- `src/components/orders/OrderDetail.tsx` — section "TIẾN ĐỘ SẢN XUẤT" (lazy fetch,
  chỉ hiện khi order có MachineAssignment).
- `src/components/orders/POSummaryTable.tsx` — cột "Đã SX (m)" + "Còn lại (m)"
  lazy-loaded khi expand PI Number group (1 fetch/sub-line, chỉ khi expand).
- `scripts/clear-knitting.ts` — one-time script đã chạy 04/07/2026 để clear data test.
  Giữ lại trong repo làm audit trail. **KHÔNG chạy lại** trừ khi cần reset.

### Extruder Daily Output ✅ (Sprint E1)
- `src/lib/excel/parseExtruderReport.ts` — parser sheet EXTRUDER (UTC-safe, regex machineId, TOTAL validation).
- `src/app/api/extruder/` — import/ (preview), import/confirm (Option B delete-then-insert), records/ (GET list), template/ (download .xlsx).
- `src/components/materials/ImportExtruderModal.tsx` & `ExtruderTab.tsx`.

### Warping Daily Output ✅ (Sprint E2)
- `src/lib/excel/parseWarpingReport.ts` — parser sheet WARPING (UTC-safe, multi-day reset on "SNY VINA CO.,LTD.", regex `^MACHINE\s*(\d+)`, TOTAL cross-check).
- `src/app/api/warping/` — import/ (preview), import/confirm (Option B delete-then-insert), records/ (GET list), template/ (download .xlsx).
- `src/components/materials/ImportWarpingModal.tsx` & `WarpingTab.tsx` (hiển thị cột "Beam 1" / "Beam 2").
- Domain terminology:
  - `EXT-01` đến `EXT-08`: mã máy Extruder (kéo sợi)
  - `WARP-01` đến `WARP-06`: mã máy Warping (xe/mắc sợi, khác EXT-01..08 Extruder, khác M-001..040 máy dệt)
  - `weavingMachineRef`: số máy dệt liên quan lưu dạng text (vd "24", "25+28"), KHÔNG validate FK với bảng máy — Phase 1 chỉ hiển thị tham khảo.
- ⚠️ PENDING open item:
  - field `beamCount1`/`beamCount2` trong `WarpingDailyOutput` là tên PLACEHOLDER — chưa xác nhận ý nghĩa nghiệp vụ thật với SNY (Dung/Loan). KHÔNG dùng 2 field này cho bất kỳ tính toán/công thức nào ở Phase 2 cho đến khi có xác nhận và rename.

### AssignModal Sub-line Detail ✅
- `src/app/schedule/actions.ts` — thêm subLineIndex, widthM, gsm, color,
  meshType, lengthM, qty vào select. Sort dùng JS localeCompare numeric
  (KHÔNG dùng Prisma orderBy — Prisma sort lexicographic, không có numeric
  equivalent). Format label: "{piNumber} · Dòng {n} — {widthM}m · {color}
  · {gsm}gsm · {meshType}". meshType chỉ hiện nếu có giá trị.
- `src/components/schedule/AssignModal.tsx` — dropdown sub-line level,
  detail panel sau khi chọn (piNumber, subLineIndex, customer, widthM,
  gsm, color, meshType, lengthM, qty)
- `src/components/schedule/AssignFromOrderModal.tsx` — mở rộng order
  info panel từ 3 lên 7 fields
- API `/api/assignments` và `/api/orders` KHÔNG thay đổi

### Order Status Badge + Filter ✅
- `src/lib/orderStatus.ts` — utility calcOrderStatus() + STATUS_CONFIG.
  Logic tính từ MachineAssignment, so sánh với today UTC+7.
  KHÔNG có field status trong DB — tính runtime.
  Status priority: RUNNING > SCHEDULED > DONE > PENDING
  ```
  PENDING    = không có assignment nào
  SCHEDULED  = có assignment, startDate > today (UTC+7)
  RUNNING    = có assignment, startDate <= today <= endDate
  DONE       = tất cả assignments có endDate < today
  ```
- `src/components/orders/OrderStatusBadge.tsx` — pill badge component,
  màu theo STATUS_CONFIG: gray/blue/green/navy
- `src/types/index.ts` — thêm assignments?: {startDate,endDate}[] vào
  SerializedProductionOrder
- `src/app/orders/page.tsx` — include assignments trong Prisma query
- `src/app/orders/summary/page.tsx` — include assignments, badge cạnh
  PI Number header (aggregate status mạnh nhất của group)
- `src/app/orders/[id]/page.tsx` — include assignments
- `src/app/api/orders/[id]/route.ts` — GET handler include assignments
  (EXCEPTION từ protected rule — chỉ thêm include, không đổi logic)
- `src/components/orders/OrderTable.tsx` — filter tabs client-side
  (Tất cả / Chưa lên lịch / Đã lên lịch / Đang sản xuất / Hoàn thành),
  badge cạnh PI Number
- `src/components/orders/POSummaryTable.tsx` — badge aggregate status
- `src/components/orders/OrderDetail.tsx` — badge cạnh PI Number đầu trang

### Materials Parser Fix + NVL Template ✅ (update 16/07/2026)
- `src/lib/excel/parseMaterialReport.ts` — FIX: bỏ hoàn toàn điều kiện skip
  khi tất cả cột = 0. Giờ chỉ skip khi: (1) dòng trống hoàn toàn,
  (2) không có tên NVL, (3) dòng TOTAL/TỔNG/CỘNG.
  NVL có LAST STOCK = 0 nhưng có tên → được giữ lại (NVL hết hàng vẫn
  cần theo dõi trong hệ thống).
- `public/templates/nvl-template.xlsx` — file template chuẩn 134 NVL,
  sheet RAW_MATERIAL, header row 4: # | NHÓM | TÊN NGUYÊN LIỆU |
  FISRT STOCK | IN | OUT USEING | LAST STOCK.
  KHÔNG có dòng TOTAL ở cuối (parser sẽ đọc nhầm thành NVL).
- `src/app/api/materials/nvl-template/route.ts` — GET handler trả về
  file nvl-template.xlsx để download
- `src/app/materials/page.tsx` — thêm button 'Tải mẫu NVL' cạnh
  'Import báo cáo', style giống 'Tải mẫu Dệt'

Note quan trọng về file template NVL:
- File gốc SNY có 3 section khác nhau (HDPE/MB/KOREA) với column offset khác nhau
- Template chuẩn hóa về 1 format duy nhất: tất cả NVL cùng 1 cấu trúc cột
- MB LAST STOCK đọc từ col N (idx 13), KHÔNG phải col M (idx 12) — đây là
  bug trong file gốc của SNY
- Workout: KH tải template → điền LAST STOCK → upload → Import báo cáo

### Rolling Daily Metric ✅ (Sprint J1)
- `src/lib/excel/parseRollingReport.ts` — long-format parser sheet ROLLING:
  - Quét ranh giới block-ngày theo Merged Cells ở hàng 4.
  - Lưu nguyên trạng `metricLabel` thật (VD `"QUANTITY SMALL"`, `"WEIGHT DAY"`), KHÔNG ép ý nghĩa nghiệp vụ (SMALL/BIG vs DAY/NIGHT).
  - Loại bỏ 2 cột TOTAL/block (cộng dồn), chỉ lưu 6 chỉ số thực tế/ca/size của từng block-ngày.
  - Đã import 2 file đầy đủ nhất: `07-2026 (3)` (01/07→30/07) và `08-2026` (01/08→05/08).
- `src/app/api/materials/rolling/` — `import/` (preview), `import/confirm` (upsert/insert), `records/` (GET list với ORM thuần).
- `src/components/materials/RollingTab.tsx` & `ImportRollingReportModal.tsx` — 4 thẻ thống kê, bộ lọc ngày, bộ lọc PI dropdown, bảng dữ liệu giữ nguyên `metricLabel`.

### Packing Daily Output ✅ (Sprint J2)
- `src/lib/excel/parsePackingReport.ts` — parser sheet SẢN LƯỢNG ĐÓNG GÓI:
  - Đọc sản lượng ca ngày + ca đêm theo NGÀY (tổng nhà máy, KHÔNG phân tách theo PI).
- `src/app/api/materials/packing/` — `records/` (GET list), `import/` (preview), `import/confirm` (confirm).
- `src/components/materials/PackingTab.tsx` & `ImportPackingReportModal.tsx` — 3 thẻ thống kê, trạng thái rỗng (empty state) thân thiện khi 0 bản ghi.

### Rolling Parser Fix & Footer Cleanup ✅ (Fix)
- **Sửa parser**: Ngăn đọc nhầm dòng chân bảng (`SCRAP`, `%`, `TOTAL`) khi Cột ORDER bị rỗng (code cũ fallback Cột STT) $\rightarrow$ bắt buộc lấy `orderRef` ở Cột ORDER, dừng ngay khi gặp từ khóa chân bảng hoặc 3 dòng rỗng liên tiếp.
- **Dọn dữ liệu rác DB**: Xóa 52 bản ghi rác (`orderRef IN ('SCRAP', '%')`) khỏi `RollingDailyMetric` (46 bản ghi từ file 07-2026, 6 bản ghi từ file 08-2026). Số bản ghi đơn hàng sạch còn lại: **2.011 bản ghi**.

### Order type variants ✅
- All order forms support 3 order types with conditional fields:
  - `"meters"`: shows `lengthM` as "Tổng mét".
  - `"rolls"`: shows `qty` (cuộn) + `rollLength` (mét/cuộn), auto-calculates total.
  - `"pieces"`: shows `qty` (tấm) + `pieceLength` (chiều dài tấm), auto-calculates total.

### Eyelet tracking ✅
- `hasEyelet` checkbox + conditional `eyeletColor` field — now **per-line** in `MultiLineOrderForm` (not shared), and per-record in `OrderDetail` edit mode.
- Shown in Schedule `DetailModal` when `hasEyelet = true`.

### MB Code field ✅
- `mbCode` text field — for masterbatch color code tracking (e.g. MYD4501A, 7079, LS309315).
- In `MultiLineOrderForm`: shared field (same MB for all lines); in `OrderDetail`: per-record.

### dataSource field ✅ — CRITICAL, do NOT remove
```prisma
dataSource   String   @default("manual")
// "manual" = KH nhập tay thật (multi-line form) → dùng cho AI training Phase 2
// "import" = Excel import / bulk paste          → dùng cho AI training Phase 2
// "seed"   = demo data do TESO tạo              → KHÔNG dùng cho AI training
```
> ⚠️ **WARNING for future agents:** `datasource db { ... }` at the top of `schema.prisma` is Prisma's DB connection config keyword — **completely unrelated** to the `dataSource` business field on `ProductionOrder`. Do NOT confuse the two. Do NOT remove `dataSource` when troubleshooting Prisma Client errors. If Prisma reports "Unknown argument `dataSource`", the fix is **`npx prisma generate`** (Prisma Client out of sync), NOT deleting the field.

### UX Polish ✅
- Redirect to `/orders` after multi-line order creation.
- No top nav tabs.
- Side nav: Production, Schedule, Materials active; Reports, Settings disabled with Phase 2 pill.
- Table row hover states + empty state messages throughout.
- Modal backdrop click to close.

### Navigation (current state)
- **Top nav:** logo + Phase 1 badge + bell + avatar only (NO tabs)
- **Side nav:** Production(`/orders`), Schedule(`/schedule`), Materials(`/materials`), Reports(disabled), Settings(disabled)

### Draft Order ✅ (Sprint F1)
- **Domain Terminology:**
  - **Đơn nháp (`isDraft = true`)**: Lưu tạm khi thiếu thông số kỹ thuật, chỉ bắt buộc `piNumber` + `customer`. KHÔNG được gán vào Schedule (M2) cho đến khi Duyệt. Nút "Duyệt đơn nháp" validate lại đầy đủ, set `isDraft = false` nếu đủ field.
- **APIs mới:**
  - `POST /api/orders/[id]/approve`: Duyệt đơn nháp (validate `multiLineOrderSchema`, recalculate weights, set `isDraft = false`). Trả về 422 với `missingFields: string[]` nếu thiếu field.
  - `GET /api/orders/check-pi`: Cảnh báo PI Number trùng khác khách hàng ngay khi nhập.
- **Schema & Null Safety:**
  - `isDraft Boolean @default(false)` trên `ProductionOrder` model (với `@@index([isDraft])`).
  - `widthM`, `lengthM`, `gsm`, `color` giờ là OPTIONAL (`Float?`, `Int?`, `String?`) cho đơn nháp.
  - ⚠️ Mọi nơi đọc 4 field này PHẢI xử lý null (hiện "—", KHÔNG NaN/undefined) — xem null-safety audit tại `docs/specs/f1-draft-order.md`.
- **UI & Flow:**
  - `draftMultiLineOrderSchema` trong `src/lib/validations/order.ts` (chỉ bắt buộc `piNumber` + `customer`).
  - Checkbox "Đây là đơn nháp" trong `MultiLineOrderForm.tsx` (`/orders/new-multi`).
  - `DraftBadge` component (`src/components/orders/DraftBadge.tsx`) hiển thị trên `OrderTable`, `OrderDetail`, `POSummaryTable`.
  - `OrderDetail.tsx` — banner cảnh báo đơn nháp + nút **"Duyệt đơn nháp →"** + box hiển thị field còn thiếu + **ẩn hoàn toàn section Progress Tracking**.
  - `AssignModal` & `AssignFromOrderModal` — lọc đơn nháp ở query DB (`isDraft: false`) và chặn gán đơn nháp trong API POST.
  - Excel Import & Bulk Paste **không hỗ trợ tạo nháp** (vẫn báo lỗi validate như cũ nếu thiếu field).

### Form UX, Search, Bulk-edit PI & ColorPreset ✅ (Sprint F4)
- **Layout MultiLineOrderForm.tsx**:
  - **Row 1**: Màu (Color) | Khổ (m) | Mét/cuộn (hoặc length field tương ứng orderType) | Kiểu đơn.
  - **Row 2**: GSM | Số cuộn (hoặc số tấm).
- **Fix FR%/UV%**:
  - `uvPct`/`frPct` mặc định rỗng (không phải 0).
  - Thêm checkbox `Chống cháy (FR)` (`frFlag`): khi chọn → bắt buộc `frPct > 0`.
- **Button "Tải mẫu Excel"**:
  - Thêm tại `/orders` (cạnh Import Excel) dẫn tới `GET /api/orders/template`.
- **Search theo Color + GSM**:
  - Thêm tìm kiếm theo `Color` (contains) và `GSM` (exact number) tại `OrderTable.tsx`.
- **Bulk-edit PI Number (`/orders/summary`)**:
  - Nút **"Sửa chung PO"** trên từng group header mở `BulkEditPOModal.tsx`.
  - `PATCH /api/orders/bulk-edit-pi` cập nhật đồng bộ các field chung (`customer`, `orderDate`, `deliveryDate`, `containerSize`, `description`, `remark`) trong 1 `$transaction` duy nhất.
- **ColorPreset theo Khách hàng**:
  - Model `ColorPreset` trong DB liên kết `Customer`.
  - Seeded 16 mẫu màu chuẩn cho `INTERWAY GLOBAL CO., LTD`.
  - Autocomplete gợi ý mẫu màu + tự động điền `mbCode`, `needleCount` (wale), `eyeletLines` khi Planner nhập form `MultiLineOrderForm.tsx`.

### Order Journey — Link data + Loss formula + PO Summary display ✅ (Sprint G1-G3)
- **Loss formula**:
  - `requiredYarnKg = totalWeightKgs * 1.05` (5% loss added to finished weight; input yarn > output fabric).
  - Calculated automatically whenever order weights update.
- **Schema & FK Relations**:
  - `orderId String?` added to `ExtruderDailyOutput`, `WarpingDailyOutput`, and `KnittingDailyDetail` with FK to `ProductionOrder(id)`.
  - Backfilled 66 records (55.0%) unambiguously linked by `orderRef` (matching single sub-line PIs).
- **PO Summary Journey Bar (`POSummaryTable.tsx`)**:
  - Shows **Hành trình sản xuất**: Kéo sợi (%) | Cuốn (%) | Dệt (theo dòng).
  - Differentiates `0% - Chưa sản xuất` vs `⚠️ Có dữ liệu chưa liên kết` badge (with tooltip for ambiguous/unlinked PI references).
- **API `GET /api/orders/journey-summary`**: Returns Extruder/Warping weights and unlinked data flags per `piNumber`.

### Draft Schedule Placeholder ✅ (Sprint H2)
- **Placeholder Rule**: `MachineAssignment.isPlaceholder Boolean @default(false)`. Đơn nháp được phép gán máy dệt dạng "Giữ chỗ tạm", chiếm slot lịch sản xuất và áp dụng đầy đủ Overlap Check (HTTP 409).
- **Tự động chuyển đổi**: Khi duyệt đơn nháp (`POST /api/orders/[id]/approve`), tất cả assignments thuộc đơn nháp đó tự động chuyển `isPlaceholder = false` trong cùng 1 `$transaction`. Backfill 1 lần cho 146 record F3 cũ.
- **APIs & Modals**: `AssignModal` và `AssignFromOrderModal` cho phép chọn đơn nháp (gắn nhãn `📌 [Nháp]`).
- **OrderDetail**: Nút **"Assign to machine"** hiển thị công khai cho mọi đơn (cả đơn nháp lẫn chính thức).

### Edit Assignment & PI Color Coding ✅ (Sprint H3)
- **Sửa Lịch Trực Tiếp (`PATCH /api/assignments/[id]`)**: Cho phép sửa trực tiếp `machineId`, `startDate`, `endDate`, `orderId` trong `DetailModal.tsx`. Overlap check (409) tự động loại trừ chính record đang sửa (`id: { not: id }`).
- **Tô màu theo PI Number (`src/lib/colors.ts`)**: Tính toán màu sắc cố định (deterministic color palette 16 màu) dựa trên mã `piNumber`. Tất cả các ô lịch thuộc cùng 1 PI Number tự động có màu nền & chữ phân biệt, đồng bộ cho cả bản ghi cũ lẫn mới.
- ⚠️ **Kinh nghiệm xương máu UX & Build (CRITICAL RULE)**: KHÔNG dùng class Tailwind động (vd `bg-${color}`) vì Tailwind sẽ purge mất class khi `next build`. **BẮT BUỘC DÙNG INLINE STYLE** (`style={{ backgroundColor: colorStyle.bgHex, color: colorStyle.textHex }}`) để đảm bảo màu nền hiển thị 100% không bị purge hay ghi đè.
- **Đơn nháp giữ chỗ (2 tầng Style độc lập)**: Màu nền PI (tầng 1) + Viền đứt nét `border-2 border-dashed border-amber-600` + Badge `📌 Nháp` (tầng 2) hiển thị kết hợp không đè nhau.

### GSM Sản Xuất Thực Tế ✅ (Sprint I2)
- **Thuộc tính mới**: `ProductionOrder.productionGsm Int?` (nullable, optional) — dùng cho các dòng sản phẩm dệt (đặc biệt Shade Net M+T) cần chạy GSM thực tế cao hơn GSM thương mại trên hợp đồng/PI.
- **Tách biệt 2 con số**:
  - `totalWeightKgs` (Trọng lượng hiển thị PO cho khách) = `(qtySqm × gsm) / 1000` (KHÔNG ĐỔI).
  - `requiredYarnKg` (Nhu cầu sợi nội bộ) = `(qtySqm × (productionGsm ?? gsm) / 1000) × 1.05` (tự động dùng `productionGsm` khi có giá trị, fallback `gsm` gốc cho 119+ đơn cũ).
- **UI Updates**:
  - `MultiLineOrderForm.tsx`: Thêm ô nhập **"GSM sản xuất (thực tế)"** kế bên ô GSM đơn hàng; chip Live preview hiển thị đồng thời cả Trọng lượng PO và Nhu cầu sợi.
  - `OrderDetail.tsx`: Hiển thị phân biệt **GSM (đơn hàng)** và **GSM sản xuất thực tế** ở View mode & Edit mode.

### Packages installed (do NOT reinstall)
- next@14.2.35, react, react-dom, typescript, tailwindcss
- prisma@5.22.0, @prisma/client@5.22.0
- react-hook-form@7.x, zod@4.x, @hookform/resolvers
- xlsx (SheetJS), tsx

### package.json build script (DO NOT change)
```
"build": "prisma generate && next build"
```

---

## 4. Database schema (current)

```prisma
model ProductionOrder {
  id           String   @id @default(cuid())

  // PI = Proforma Invoice — the primary order identifier at SNY
  piNumber     String
  // Sub-line index within a PI (0-based). A PI can have multiple fabric specs.
  subLineIndex Int      @default(0)

  // Order info
  customer     String
  orderDate    DateTime

  // Fabric specs (optional for draft orders, required for approved orders)
  widthM       Float?   // roll width in metres (e.g. 4.0)
  lengthM      Float?   // order length in metres (or calculated total for rolls/pieces)
  gsm          Int?     // grams per square metre (e.g. 165)
  productionGsm Int?    // GSM sản xuất thực tế (Sprint I2) — optional, dùng tính requiredYarnKg
  color        String?  // e.g. "BLACK", "WHITE"
  mbCode       String?  // Mã Masterbatch màu — e.g. "MYD4501A", "7079", "LS309315"

  // Draft Order (Sprint F1)
  isDraft      Boolean  @default(false)

  // ⚠️ Mọi nơi đọc 4 field này (widthM/lengthM/gsm/color) PHẢI xử lý null (hiện "—", KHÔNG NaN/undefined) — xem null-safety audit tại docs/specs/f1-draft-order.md

  // Optional order details
  qty          Int?                  // quantity in rolls or pieces
  uvPct        Decimal?  @db.Decimal(5, 2) // UV treatment percentage 0-100
  frFlag       Boolean   @default(false)   // flame-retardant treatment
  description  String?               // free-text order description
  remark       String?               // free-text internal remark

  // Technical specs
  meshType     String?               // Thể loại lưới
  needleCount  Int?                  // Số kim
  beamCount    Int?                  // Số dàn

  // Kiểu đơn hàng — xác định cách tính tổng mét
  orderType   String   @default("meters")
  // "rolls"  = tính theo cuộn (qty × rollLength)
  // "meters" = tính theo tổng mét (lengthM)
  // "pieces" = gia công tấm (qty × pieceLength)

  rollLength  Decimal? @db.Decimal(10, 2)
  // Số mét/cuộn — chỉ dùng khi orderType = "rolls"

  pieceLength Decimal? @db.Decimal(10, 2)
  // Chiều dài tấm (m) — chỉ dùng khi orderType = "pieces"

  // Eyelet — phụ kiện khoen trên sản phẩm lưới
  hasEyelet    Boolean  @default(false)  // Có eyelet không
  eyeletColor  String?                   // Màu eyelet

  // Calculated weight fields (Case A formula)
  // qtySqm = widthM × totalMeters
  // totalWeightKgs = qtySqm × gsm / 1000
  qtySqm         Decimal? @db.Decimal(12, 2)  // tổng diện tích m²
  totalWeightKgs Decimal? @db.Decimal(12, 2)  // tổng trọng lượng kg

  // Workflow status
  status       String   @default("PENDING") // PENDING | IN_PRODUCTION | DONE | CANCELLED

  // dataSource tracking for AI training data quality (Phase 2):
  // "manual" = KH nhập tay thật → dùng cho AI training
  // "import" = Excel/bulk paste → dùng cho AI training
  // "seed"   = demo data do TESO tạo → KHÔNG dùng cho AI training
  dataSource   String   @default("manual")

  // Relations — một đơn hàng có thể chạy trên nhiều máy song song
  assignments  MachineAssignment[]

  // Timestamps
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([piNumber, subLineIndex])
  @@index([piNumber])
  @@index([orderDate])
  @@map("production_orders")
}

model Material {
  id           String   @id @default(cuid())
  name         String   // e.g. "MF", "UV 4%", "Tái chế", "FR", "IR"
  currentStock Decimal  @db.Decimal(10, 2)  // kg hiện có
  minThreshold Decimal? @db.Decimal(10, 2)  // ngưỡng tối thiểu cảnh báo — null = chưa đặt ngưỡng
  unit         String   @default("kg")
  note         String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  transactions MaterialTransaction[]

  @@map("materials")
}

model MachineAssignment {
  id        String   @id @default(cuid())
  machineId String   // e.g. "M-001" to "M-040"

  // orderId is NOT @unique — 1 order can have multiple machine assignments (parallel production)
  orderId   String
  order     ProductionOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)

  // Số mét phân công cho máy này (optional, dùng khi chia đơn)
  allocatedMeters Decimal? @db.Decimal(10, 2)

  // Sản lượng dự kiến (m/ngày) — planner nhập tay khi assign
  // Dùng cho công thức ngày hoàn thành ở Phase 2 (không tính trong sprint này)
  estimatedDailyOutput Decimal? @db.Decimal(10, 2)

  // Đơn nháp gán máy = giữ chỗ tạm (viền đứt nét trên UI), tự động chuyển false khi đơn được Duyệt
  isPlaceholder Boolean  @default(false)

  startDate DateTime
  endDate   DateTime

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([machineId, startDate, orderId])
  @@map("machine_assignments")
}

model MaterialTransaction {
  id         String   @id @default(cuid())
  materialId String
  material   Material @relation(fields: [materialId], references: [id], onDelete: Cascade)

  // txType valid values:
  // "in"         = nhập kho
  // "out_using"  = xuất sử dụng sản xuất
  // "out_broken" = xuất hỏng (HDPE BROKEN)
  // "out_tape"   = xuất làm băng keo (OUT TAPE)
  // "out_reject" = xuất reject
  txType     String

  quantityKg Decimal  @db.Decimal(10, 2)   // số kg
  txDate     DateTime                       // ngày giao dịch
  mbPct      Decimal? @db.Decimal(5, 2)    // % MB trên 1 tấn nhựa (chỉ dùng cho loại MB)
  orderId    String?                        // link đơn hàng nếu có (optional)
  note       String?

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([materialId])
  @@index([txDate])
  @@map("material_transactions")
}
```

### KnittingDailyOutput
```prisma
model KnittingDailyOutput {
  id               String   @id @default(cuid())
  machineId        String   // "M-001" to "M-040"
  reportDate       DateTime // UTC midnight của ngày báo cáo (từ serial number, không phải JS Date)
  dailyMeters      Decimal  @db.Decimal(10, 2) // mét dệt trong ngày (col I từ file)
  cumulativeMeters Decimal  @db.Decimal(10, 2) // giữ cho schema compat, = dailyMeters
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@unique([machineId, reportDate])
  @@map("knitting_daily_output")
}
```
⚠️ Note: `cumulativeMeters` hiện lưu cùng giá trị với `dailyMeters` —
field này không còn ý nghĩa "cumulative", giữ lại để không breaking schema.

⚠️ QUAN TRỌNG: model KnittingDailyOutput (đã có từ trước) KHÔNG bị đổi, vẫn chạy song song với KnittingDailyDetail — 2 model độc lập, phục vụ 2 mục đích khác nhau.

### ExtruderDailyOutput
```prisma
model ExtruderDailyOutput {
  id         String   @id @default(cuid())
  machineId  String   // "EXT-01".."EXT-08"
  reportDate DateTime // UTC midnight
  shift      String   // "D" | "N"
  color      String
  denier     Decimal?
  weightKgs  Decimal  @db.Decimal(10,2)
  beamNote   String?  // vd "11 BEAM ( 158 SỢI)"
  orderRef   String?  // vd "JPY26-274"
  dataSource String   @default("import")
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

### WarpingDailyOutput
```prisma
model WarpingDailyOutput {
  id                String   @id @default(cuid())
  machineId         String   // "WARP-01".."WARP-06"
  reportDate        DateTime
  shift             String
  weavingMachineRef String?  // số máy dệt liên quan, text tự do vd "24", "25+28" — KHÔNG validate FK
  color             String
  denier            Decimal?
  strand            Int?
  beamCount1        Decimal? // ⚠️ TÊN PLACEHOLDER — xem mục "Open items" bên dưới
  mPerEa            Decimal?
  weigValue         Decimal?
  beamCount2        Decimal? // ⚠️ TÊN PLACEHOLDER — xem mục "Open items" bên dưới
  quantity          Int?
  weightKgs         Decimal  @db.Decimal(10,2)
  orderRef          String?
  dataSource        String   @default("import")
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

### KnittingDailyDetail
```prisma
model KnittingDailyDetail {
  id             String   @id @default(cuid())
  machineId      String   // "M-001".."M-040" — khớp trực tiếp máy dệt Schedule
  reportDate     DateTime
  shift          String
  width          Decimal?
  color          String
  weightSpec     Decimal?
  lengthM        Decimal?
  tapeRoll       Int?
  mValue         Decimal?
  avgPerRoll     Decimal?
  quantity       Int?
  weightKgs      Decimal  @db.Decimal(10,2)
  orderRef       String?
  machineNote    String?  // ghi chú cấp máy (thay dàn, đổi màu...), same-value cho cả block máy/ngày
  machineSizeM   Decimal?
  cmPerMin       Decimal?
  meterPerDay    Decimal?
  operatingGrade Decimal?
  totalPct       Decimal?
  dataSource     String   @default("import")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

### MachineSpec (Sprint F3)
```prisma
model MachineSpec {
  machineId String   @id            // "M-001" to "M-040"
  widthM    Float                   // khổ máy (m) — từ col A file lịch, dùng cho Sprint D
  updatedAt DateTime @updatedAt
  @@map("machine_specs")
}
```

### ScheduleImportLog (Sprint F3)
```prisma
model ScheduleImportLog {
  id         String   @id @default(cuid())
  importedAt DateTime @default(now())
  backupData Json     // snapshot MachineAssignment bị xóa dạng JSON (audit trail & rollback)
  summary    Json     // summary count
  @@map("schedule_import_logs")
}
```

### RollingDailyMetric (Sprint J1)
```prisma
model RollingDailyMetric {
  id             String   @id @default(cuid())
  date           DateTime
  orderRef       String?  // text gốc, chuẩn hóa để match piNumber
  orderId        String?  // link thật nếu match rõ 1-1 (mô hình Sprint G1)
  color          String?
  widthM         Float?
  lengthM        Float?
  weightKgsOrder Decimal? // WEIGHT ở đầu dòng = thông số hợp đồng, KHÔNG phải sản lượng
  metricLabel    String   // tên cột thật trong Excel, VD "QUANTITY SMALL", "WEIGHT DAY" — CHƯA diễn giải nghiệp vụ
  metricValue    Decimal?
  dataSource     String
  createdAt      DateTime @default(now())

  @@index([orderRef])
  @@index([date])
  @@map("rolling_daily_metrics")
}
```

### PackingDailyOutput (Sprint J2)
```prisma
model PackingDailyOutput {
  id          String   @id @default(cuid())
  date        DateTime @unique
  qtyDay      Int?
  totalMDay   Decimal?
  weightDay   Decimal?
  qtyNight    Int?
  totalMNight Decimal?
  weightNight Decimal?
  dataSource  String
  createdAt   DateTime @default(now())
  @@map("packing_daily_outputs")
  // Ghi theo ngày, tổng cả nhà máy — KHÔNG có orderId
}
```

---

## 5. Tech stack (fixed — do NOT change)
- **Framework:** Next.js 14 App Router + TypeScript
- **Styling:** Tailwind CSS (custom design tokens in tailwind.config.ts)
- **Database:** PostgreSQL (Neon.tech) + Prisma 5.22.0
- **Form:** react-hook-form + zod v4
- **Deploy:** Vercel (auto-deploy from GitHub main)
- **Fonts:** Inter + Noto Sans KR + Material Symbols Outlined (via Google Fonts link in layout.tsx)

---

## 6. Design system (R1 — Korean minimal light theme)

### Key colors
```
primary: "#002444"          // navy
primary-container: "#1b3a5c"
on-primary: "#ffffff"
background: "#fbf9f8"       // warm white
surface: "#fbf9f8"
surface-container-lowest: "#ffffff"
surface-container-low: "#f6f3f2"
surface-container: "#f0eded"
on-surface: "#1b1c1c"
secondary: "#5e5e5e"
outline-variant: "#c3c6cf"
error: "#ba1a1a"
```

### Layout
- Top nav: fixed, 64px height, `bg-surface`
- Side nav: fixed left, 280px width, starts at top 64px
- Main content: `pl-[280px] pt-[64px]`
- Material Symbols icons: `<span className="material-symbols-outlined">icon_name</span>`

---

## 7. Project folder structure

```
sny-planner/
├── CLAUDE.md
├── .env / .env.local        ← DATABASE_URL (both needed)
├── package.json             ← build: "prisma generate && next build"
├── prisma/schema.prisma
├── src/
│   ├── app/
│   │   ├── orders/          ← list, new-multi, [id], bulk
│   │   │   ├── page.tsx               ← order list + KPI cards
│   │   │   ├── new-multi/page.tsx     ← ONLY order creation page (replaces /new)
│   │   │   ├── [id]/page.tsx          ← order detail
│   │   │   └── bulk/page.tsx          ← bulk paste import
│   │   ├── schedule/        ← M2 functional
│   │   ├── materials/       ← M3 functional
│   │   └── api/
│   │       ├── orders/      ← route.ts (GET+POST legacy), [id]/, bulk/, import/, multi-line/
│   │       ├── materials/   ← CRUD + [id]/transactions/ + import-transactions/
│   │       └── assignments/ ← schedule CRUD
│   ├── components/
│   │   ├── layout/          ← TopNav.tsx, SideNav.tsx
│   │   ├── orders/          ← OrderTable, MultiLineOrderForm, OrderDetail, ImportOrdersModal
│   │   ├── materials/       ← MaterialsTable, AddMaterialModal, EditMaterialModal,
│   │   │                       AddTransactionModal, TransactionHistoryModal,
│   │   │                       ImportMaterialReportModal
│   │   └── schedule/        ← AssignModal.tsx, DetailModal.tsx, AssignFromOrderModal.tsx
│   ├── lib/
│   │   ├── db.ts
│   │   ├── calculations/orderWeight.ts  ← calculateOrderWeight() helper (server + client safe)
│   │   ├── validations/order.ts         ← createOrderSchema, updateOrderSchema, multiLineOrderSchema
│   │   └── excel/           ← parseOrderList.ts, parsePastedText.ts, parseMaterialReport.ts
│   └── types/index.ts       ← SerializedProductionOrder, ParsedOrder
```

---

## 8. Sprint history

| Sprint | Status |
|---|---|
| S0 Scaffold | ✅ Done |
| S1 Order list | ✅ Done |
| S2 New order form | ✅ Done |
| S3 Order detail | ✅ Done |
| S4 Mock pages | ✅ Done |
| S5 Excel import | ✅ Done |
| R1 UI redesign | ✅ Done |
| Bulk paste import | ✅ Done |
| M2 Machine Schedule | ✅ Done |
| M3 Materials functional | ✅ Done |
| UX Polish | ✅ Done |
| Multi-machine assignment | ✅ Done |
| Order type variants (rolls/pieces/meters) | ✅ Done |
| MB Code + Eyelet fields | ✅ Done |
| Material Transaction system | ✅ Done |
| Material Excel Import | ✅ Done |
| Calculated weight (qtySqm + totalWeightKgs) | ✅ Done |
| Multi-line order form (merged, replaces /orders/new) | ✅ Done |
| dataSource field restored | ✅ Done |
| PO Summary + Output Input | ✅ Done |
| Knitting Daily Output | ✅ Done |
| AssignModal Sub-line Detail | ✅ Done |
| Order Status Badge + Filter | ✅ Done |
| Materials parser fix + NVL template download | ✅ Done |
| Sprint E1 — Extruder Daily Output | ✅ Done |
| Sprint E2 — Warping Daily Output | ✅ Done |
| Sprint E3 — Knitting Daily Detail | ✅ Done |
| Sprint F3 — Bulk Import Schedule | ✅ Done |
| Sprint H2 — Giữ chỗ sản xuất cho Đơn nháp (Placeholder Assignment) | ✅ Done |
| Sprint H3 — Sửa lịch trực tiếp + Tô màu theo PI trên Schedule | ✅ Done |

## 9. Sprints pending — Must have trước Gate G3 (24–27/7)

| # | Sprint | Mô tả | Status |
|---|---|---|---|
| 1 | mbCode per-line | Chuyển `mbCode` từ shared section xuống per-line trong `MultiLineOrderForm` | ⏳ Pending |
| 2 | frPct (Decimal) thay frFlag (Boolean) | Nhập % FR thay vì checkbox | ⏳ Pending |
| 3 | Xóa data test | Xóa data test trước UAT: TEST-DUP-01, PI-2026-TEST*, PI-2026-TEST-1* | ⏳ Pending |

Req mới từ Dung/Loan (16/07/2026) — chưa build:
1. Ghi chú per dòng hàng (`lineNote String?`) — Sprint A, nhỏ
2. FR% như UV% (`frPct Decimal`, bắt buộc) — Sprint A, đã pending
3. Checkbox đóng gói (`requiresPacking Boolean`) — Sprint A, nhỏ
4. Bỏ mbCode khỏi shared section — Sprint A, đã pending
5. Ngày giao hàng (`deliveryDate Date?`) — Sprint A, nhỏ
6. Container size (`containerSize String?`) — Sprint A, nhỏ
7. Customer Database + autocomplete — Sprint B riêng, sau G3
8. Badge cảnh báo KH mới (phụ thuộc req 7) — Sprint B, sau G3

## 9b. Backlog (sau G3 hoặc chờ feedback)

1. **Work Order Case B/C/D** (yarnPerBeam, meterPerBeam, kgPerBeam) — công thức đã confirm, nhưng input fields (lossFactor, needles, looms, beamCount, denier) chưa rõ: planner nhập tay hay tách từ field khác. Chưa hỏi Dung.
2. **Extruder tracking scope** — Dung xác nhận muốn nhập nhưng chưa trả lời 3 câu: số máy Extruder, theo máy hay theo loại sợi, có link trực tiếp đơn hàng không.
3. **"Số mét tổng" trên PO Summary** — hiện chỉ có M² (TỔNG) và KG (TỔNG), chưa có cột tổng số MÉT riêng. Cần hỏi Loan có cần thiết không trước khi thêm.
4. **Auth** — NextAuth.js v5, 3 roles: Admin/Planner/Viewer (sprint riêng sau G3).
5. **Phase 2 AI** — AI-1 gợi ý lịch, AI-2 cảnh báo NVL, AI-3 chat tiếng Việt.

## 9c. Domain Terminology & Open items
- **EXT-01 đến EXT-08**: mã máy Extruder (8 máy, khác M-001..M-040 máy dệt)
- **WARP-01 đến WARP-06**: mã máy Warping (6 máy, khác EXT và khác M-001..040)
- **weavingMachineRef**: số máy dệt liên quan trong báo cáo Warping, lưu text tự do, KHÔNG validate FK
- **KnittingDailyOutput vs KnittingDailyDetail**: Output = tổng mét/máy/ngày, phục vụ Progress Tracking LIVE trên Order Detail/PO Summary (KHÔNG đổi). Detail = breakdown ca/màu/đơn hàng + thông số vận hành máy, phục vụ Sprint D (thông số dàn máy trên Schedule)
- **machineNote**: ghi chú vận hành cấp máy/ngày (vd thay dàn, đổi màu) — gắn same-value cho toàn bộ record cùng máy/ngày trong KnittingDailyDetail, không phải ghi chú riêng từng dòng
- ⚠️ **PENDING**: field `beamCount1`/`beamCount2` trong WarpingDailyOutput là TÊN PLACEHOLDER — chưa xác nhận ý nghĩa nghiệp vụ thật với SNY (Dung/Loan). KHÔNG dùng 2 field này cho bất kỳ tính toán/công thức nào ở Phase 2 cho đến khi có xác nhận và rename.
- ⚠️ **6 record ambiguous cần gán tay**: `JPY26-274` ×4 (màu SWHITE/SHOW WHITE lệch tên, cần chọn đúng sub-line khổ 2.6m/3.1m), `IWN26-161` ×2 (màu "D. SANDT TAPE" — cần Dung xác nhận màu thật là gì trước). *Lưu ý: 2 record Knitting `IWN 26-161` (BEIGE, 3.0m, 300gsm) đã tự động gán vào SubLine 0.*
- ⚠️ **File Excel review unmatched (18 dòng unique / 46 records tổng cộng)**: Đã xuất gửi Dung rà PI lệch — CHƯA có phản hồi.
- 🟡 **Rolling — orderId chưa match**: phần lớn 2.011 bản ghi Rolling mới import có `orderId = null` (chỉ lưu `orderRef` text thô). Cần audit tỷ lệ match thật với `piNumber` trong bảng ProductionOrder, giống cách đã làm ở Sprint G1 cho Extruder/Warping/Knitting.
- 🟡 **Rolling — ý nghĩa SMALL/BIG chưa xác nhận**: vẫn treo như dự kiến ban đầu, giờ dữ liệu đã lên hệ thống nên có thể hỏi Dung bất cứ lúc nào mà không chặn tiến độ. Câu hỏi cụ thể: SMALL/BIG là cỡ lõi cuộn hay phân loại đơn hàng? Vì sao 1 sheet đổi qua lại giữa DAY/NIGHT và SMALL/BIG theo từng ngày?
- 🟡 **Rolling — giới hạn nhãn ngày gộp**: nhãn "04+05th", "31th+1th" gán toàn bộ dữ liệu vào ngày đầu (04, 31) — ngày sau đó (05, ngày 1 tháng kế) sẽ trống dữ liệu Rolling. Đây là giới hạn dữ liệu nguồn (xưởng ghi chung 2 ngày 1 cột), không phải bug, đã ghi chú trong code.
- 🟡 **Đóng gói**: chờ xưởng điền dữ liệu thật vào sheet "SẢN LƯỢNG ĐÓNG GÓI" các tháng tới, khi đó chỉ cần bấm Import trên UI đã có sẵn.
- 🟡 **sumWeightKg Rolling**: có 1 lần đối chiếu độc lập ra số lệch (614k vs 307k kg) nhưng xác định là do lỗi trong script tự kiểm tra (giả định sai độ rộng block khi gặp nhãn ngày gộp), KHÔNG phải lỗi hệ thống — nhưng chưa audit lại 100% để loại trừ hoàn toàn, nên vẫn ghi chú theo dõi.
- ⚠️ **Regression Knitting Progress Tracking**: Khách từng báo ("trước dc rồi giờ chưa chạy dc") — CHƯA XÁC MINH, cần kiểm tra PI `CVellis26-2` + hỏi khách đơn cụ thể.
- ⚠️ **Schedule grid UI**: chưa hiển thị được nhiều assignment chồng cùng ngày/máy (chỉ thấy 1/N nhãn) — không mất dữ liệu, chỉ là giới hạn hiển thị, cần sprint UI riêng sau này.

---

## 10. OUT OF SCOPE — refuse even if asked
- ❌ Auth / login / roles (Next sprint)
- ❌ Work Order formula calculations (Next sprint)
- ❌ AI scheduling suggestions (Phase 2)
- ❌ Bulk delete / bulk edit
- ❌ Real-time / websockets
- ❌ Mobile responsive (desktop-first)
- ❌ Multi-tenancy
- ❌ Pricing fields (U/Price, Amount, Total Amount) — không có trong schema
- ❌ "Mark" field (e.g. T100 labeling) — không có trong schema
- ❌ Production output tracking — **ĐÃ BUILD** (Knitting Daily Output sprint). Còn chờ: Dung/Loan xác nhận UX flow sau khi dùng thật. Xem mục "Knitting Daily Output ✅" ở trên.
- ❌ Auto days-to-complete từ estimatedDailyOutput — Phase 2
- ❌ Net/Gross weight (packing-stage data)

---

## 11. Code rules (hard)
1. Every npm package must be REAL. Mark `[UNVERIFIED]` if unsure.
2. NEVER hardcode secrets. Use `.env` or `.env.local`.
3. NEVER use absolute paths.
4. NEVER swallow errors silently.
5. Files > 150 lines → split.
6. Business logic comments in Vietnamese. Boilerplate in English.
7. Zod validation on both client AND server.
8. Query via Prisma only. NO raw SQL string concat.
9. NEVER `dangerouslySetInnerHTML` with user input.
10. NEVER delete files or DB without Tung's confirmation.
11. Sau khi hoàn thành 1 sprint, XÓA ngay các script debug/migration tạm thời (vd `scripts/debug-*.ts`, script migration 1-lần-dùng-xong) khỏi repo — dù không chạy trong luồng chính, TypeScript vẫn quét khi build và có thể âm thầm chặn Vercel build.
12. Khi báo cáo đã hoàn thành 1 hành động (xóa file, sửa file...), PHẢI kèm bằng chứng xác minh (git status/git diff, không chỉ mô tả bằng lời) — tiền lệ: từng báo 'đã xóa file' nhưng thực tế file vẫn còn nguyên trên đĩa, gây mất thời gian điều tra lại.

---

## 11b. Sprint Workflow & Verification Standard (Phase C)
Trong Phase C (Verify) của mọi sprint từ giờ về sau:
- **BẮT BUỘC:** Chạy `npm run build` (lệnh build thật, giống hệt Vercel) — **KHÔNG dùng `tsc --noEmit` làm căn cứ duy nhất**. Tiền lệ: Sprint E3 `tsc --noEmit` pass nhưng `npm run build` fail do lỗi type trong script cũ, khiến Vercel deploy fail dù local báo pass.
- Với các file Excel dạng "STATISTICAL REPORT" nhiều bản trùng tên (do trình duyệt tự thêm hậu tố khi tải lại), **hậu tố số (1)(2)(3) KHÔNG phản ánh thời gian tạo file** — phải đọc khoảng ngày dữ liệu thật bên trong (quét các cell datetime) để xác định bản đầy đủ nhất, không được suy đoán từ tên file.
- Với sheet dạng block lặp lại theo ngày (Rolling), luôn đọc ranh giới block qua Merged Cells thật ở hàng nhãn ngày, KHÔNG giả định cố định độ rộng block (vd "luôn 8 cột") — nhãn ngày gộp (VD "04+05th") có thể làm lệch offset nếu code giả định sai.
- Khi lưu dữ liệu Excel mà ý nghĩa cột nghiệp vụ chưa rõ/gây tranh cãi (VD SMALL/BIG ở Rolling), ưu tiên lưu nguyên trạng dạng long-format theo đúng tên cột gốc thay vì ép vào 1 khái niệm đoán mò — tránh phải import lại khi có xác nhận nghiệp vụ sau này.
- Parser đọc theo dòng LUÔN phải xác định rõ điều kiện DỪNG (cột khóa rỗng liên tục, hoặc gặp từ khóa chân bảng như TOTAL/SCRAP/%) — không mặc định đọc hết `ws.max_row`, vì hầu hết sheet báo cáo Excel đều có 3-5 dòng tổng kết/chữ ký ở cuối.
- `npm run build` PASS chỉ xác nhận code compile được, KHÔNG đảm bảo API chạy đúng lúc runtime (đặc biệt lỗi cú pháp trong `prisma.$queryRaw` chỉ lộ khi gọi API thật) — luôn yêu cầu bằng chứng chạy thử API thật (JSON response cụ thể), không chỉ tin "build PASS".

---

## 12. When to STOP and ask Tung
0. TUYỆT ĐỐI KHÔNG tự gọi API/route có tính chất XÓA hoặc GHI ĐÈ dữ liệu production (confirm import, bulk delete, migration ảnh hưởng nhiều record...) để 'tự test'. Dừng lại đúng bước Preview/dry-run, báo cáo kết quả preview cho Tung, và CHỜ Tung tự thao tác qua UI thật. Vi phạm rule này 2 lần trong Sprint F3 dù đã được nhắc rõ — từ nay đây là rule cứng ngang hàng với rule không được rm/delete/drop khi chưa hỏi.
1. Spec is ambiguous
2. Need new npm package — list URL first
3. About to modify existing API routes in `src/app/api/orders/`
   EXCEPTION đã xảy ra: 2 lần đã sửa file `api/orders/[id]/route.ts` với lý do hợp lệ:
   1. Sprint eyeletLines/eyeletSpec: thêm 2 dòng map field vào updateData
   2. Sprint status badge: GET handler thêm include assignments
   Nguyên tắc: chỉ được sửa khi additive (thêm field), không được đổi logic
4. Any `rm`, `delete`, `drop`, `truncate` command
5. Test fails twice

Format:
```
[STOP] Reason: [specific]
I need to know: [max 3 questions]
My recommendation: [option A / option B]
```