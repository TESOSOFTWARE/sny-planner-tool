# E2 Warping Daily Output — Implementation Plan (PLAN ONLY)

## Goal

Thêm module **Warping Daily Output** (theo dõi sản lượng xe sợi/mắc sợi hàng ngày):
- Parse file Excel SNY (sheet `WARPING`, file mẫu `20-21.7.xlsx`) chứa sản lượng Warping của 6 máy (MACHINE 1 đến MACHINE 6).
- Lưu vào DB model `WarpingDailyOutput`.
- Thêm sub-tab **Warping** vào khu vực Materials (gồm 4 sub-tab: Extruder / Warping / Knitting / Rolling).
- Hiển thị bảng dữ liệu, filter theo ngày và máy, nút Tải mẫu + Import.

**Out of scope sprint này:**
- KHÔNG validate số máy dệt liên quan với bảng Machine Schedule.
- KHÔNG liên kết cứng FK với `ProductionOrder`.
- KHÔNG tự động tính toán formula cho giai đoạn dệt/rolling.

---

## File Tree (new & modified files)

### New files
```
prisma/
  schema.prisma                              ← [MODIFY] thêm model WarpingDailyOutput

src/lib/excel/
  parseWarpingReport.ts                      ← [NEW] parser sheet WARPING

src/app/api/warping/
  import/route.ts                            ← [NEW] POST preview (no DB write)
  import/confirm/route.ts                    ← [NEW] POST upsert (Option B delete-then-insert)
  records/route.ts                           ← [NEW] GET list (filter by date, machineId, pagination)
  template/route.ts                          ← [NEW] GET download template .xlsx

src/components/materials/
  ImportWarpingModal.tsx                     ← [NEW] 3-step modal (upload → preview → confirm)
  WarpingTab.tsx                             ← [NEW] tab UI (bảng + filter + summary cards + header)

src/app/materials/page.tsx                  ← [MODIFY] tích hợp tab WARPING vào tab bar
```

---

## Prisma Model Proposal

```prisma
model WarpingDailyOutput {
  id                String   @id @default(cuid())
  machineId         String   // "WARP-01".."WARP-06" (máy mắc sợi/xe sợi, khác M-001..M-040 máy dệt)
  reportDate        DateTime // UTC midnight (timezone-independent, tương tự Knitting & Extruder)
  shift             String   // "D" (ca ngày) hoặc "N" (ca đêm)

  // Số máy dệt liên quan (vd: "40", "M-040", "38") — lưu text tự do, KHÔNG validate FK
  weavingMachineRef String?

  color             String   // tên màu (vd "BLACK", "WHITE", "AQUA BLUE")
  denier            Decimal? @db.Decimal(10, 2)
  strand            Decimal? @db.Decimal(10, 2) // số sợi (STRAND)

  // ⚠️ TEMPORARY PLACEHOLDER NAMES: 2 cột BEAM có tên trùng nhau trong Excel gốc
  // SẼ đổi tên sau khi SNY xác nhận ý nghĩa kỹ thuật thật
  beamCount1        Decimal? @db.Decimal(10, 2) // Cột BEAM thứ 1 (trước M/EA)
  mPerEa            Decimal? @db.Decimal(10, 2) // Cột M/EA (số mét mỗi cuộn/dàn)
  weigValue         Decimal? @db.Decimal(10, 2) // Cột WEIG (trọng lượng đơn vị)
  beamCount2        Decimal? @db.Decimal(10, 2) // Cột BEAM thứ 2 (trước QUANTITY)

  quantity          Decimal? @db.Decimal(10, 2) // Cột QUANTITY
  weightKgs         Decimal  @db.Decimal(10, 2) // Cột WEIGHT (tổng kg sản lượng, 0 là hợp lệ)

  orderRef          String?  // Mã PI/đơn hàng từ cột REMARK (vd "JPY26-274")

  dataSource        String   @default("import")
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([machineId])
  @@index([reportDate])
  @@map("warping_daily_output")
}
```

---

## Cấu Trúc Sheet Excel & Rules Đã Xác Nhận Từ E1

### Cấu trúc Sheet `WARPING` trong file SNY (`20-21.7.xlsx`)
1. **Multi-day blocks**:
   - Mỗi khối ngày bắt đầu bằng dòng tiêu đề chứa `"SNY VINA CO.,LTD."`.
   - Dòng kế tiếp chứa **Excel date cell** (hoặc date string `"2026-07-20"`).
   - Parser tự động **RESET `currentDate`** khi gặp `"SNY VINA CO.,LTD."` mới.

2. **Machine blocks**:
   - Trong mỗi ngày có 6 máy: `MACHINE 1` đến `MACHINE 6`.
   - Pattern regex nhận diện header máy: `/^MACHINE\s+(\d+)/i` (co giãn khoảng trắng/tab).
   - Chuyển đổi: `MACHINE 1` → `WARP-01`, `MACHINE 6` → `WARP-06`.

3. **Cấu trúc cột dữ liệu**:
   | Index | Tên cột trong Excel | Trường tương ứng trong Model | Ghi chú |
   |---|---|---|---|
   | 0 | `STT` / `NO` | `shift` | "D" (ca ngày) hoặc "N" (ca đêm) |
   | 1 | `MÁY DỆT` | `weavingMachineRef` | Số máy dệt liên quan (vd: "40", "12") |
   | 2 | `COLOR` | `color` | Tên màu |
   | 3 | `DENIER` | `denier` | Số denier |
   | 4 | `STRAND` | `strand` | Số sợi |
   | 5 | `BEAM` (lần 1) | `beamCount1` | Cột BEAM thứ 1 (placeholder) |
   | 6 | `M/EA` | `mPerEa` | Mét/ea |
   | 7 | `WEIG` | `weigValue` | Trọng lượng đơn vị |
   | 8 | `BEAM` (lần 2) | `beamCount2` | Cột BEAM thứ 2 (placeholder) |
   | 9 | `QUANTITY` | `quantity` | Số lượng |
   | 10 | `WEIGHT` | `weightKgs` | **Trọng lượng sản lượng (LƯU VÀO DB, 0 hợp lệ)** |
   | 11 | `TOTAL` | *(Bỏ qua)* | **Cột cộng dồn — KHÔNG LƯU, chỉ dùng cross-check** |
   | 12 | `REMARK` | `orderRef` | Mã PI / đơn hàng liên quan |

4. **Hàng bị bỏ qua (Skip Rows)**:
   - Dòng tiêu đề, dòng trống.
   - Dòng `TOTAL` của từng máy (dùng cross-check `sum(WEIGHT) == TOTAL` → log warning nếu chênh lệch).
   - Dòng tổng kết ở cuối ngày (`TOTAL DAY`, `TOTAL NIGHT`, `SCRAP`, `%`) → bỏ qua hoàn toàn, không tạo bản ghi.

5. **Rule Idempotent Option B**:
   - Trước khi insert các dòng từ file import, xóa tất cả bản ghi cũ trong DB có cùng `[machineId, reportDate]`.

---

## 10 Steps Thực Hiện (Phase B Build)

1. **Step 1 — Schema Migration**:
   - Cập nhật `prisma/schema.prisma` với model `WarpingDailyOutput`.
   - Chạy `cmd /c npx prisma db push`.

2. **Step 2 — Parser `parseWarpingReport.ts`**:
   - Viết parser nhận diện `SNY VINA CO.,LTD.` để reset date.
   - Nhận diện `MACHINE 1..6` bằng regex.
   - Map đúng 12 cột dữ liệu, bỏ qua dòng TOTAL máy & TOTAL DAY/NIGHT/SCRAP.
   - Test bằng unit script với file `C:\Users\ACER\Downloads\20-21.7.xlsx`.

3. **Step 3 — Import Preview API**:
   - `POST /api/warping/import` — nhận file `.xlsx`, trả về preview (số records, dates, machines, tổng kg).

4. **Step 4 — Import Confirm API**:
   - `POST /api/warping/import/confirm` — thực hiện transaction xóa records cũ theo `[machineId, reportDate]` rồi insert bản ghi mới (Option B).

5. **Step 5 — Records GET API**:
   - `GET /api/warping/records` — hỗ trợ query theo `date`, `machineId`, phân trang.

6. **Step 6 — Template Download API**:
   - `GET /api/warping/template` — generate và trả về file mẫu `.xlsx` chuẩn cột Warping.

7. **Step 7 — Modal Import `ImportWarpingModal.tsx`**:
   - UI 3 bước (Upload → Preview tổng quan + danh sách ngày + máy → Confirm).

8. **Step 8 — Component Tab `WarpingTab.tsx`**:
   - UI bảng dữ liệu Warping (kèm cột `MÁY DỆT`, `M/EA`, `WEIG`, `STRAND`, `BEAM 1`, `BEAM 2`).
   - Bộ lọc Ngày & Máy (`WARP-01` đến `WARP-06`).
   - Thẻ thống kê Summary Cards (Tổng dòng, Số máy, Tổng kg).

9. **Step 9 — Tích Hợp Trang `/materials`**:
   - Cập nhật `src/app/materials/page.tsx` hỗ trợ 4 sub-tabs: `EXTRUDER`, `WARPING`, `HDPE`, `MB`, `KOREA`.
   - Kết nối render `<WarpingTab>` và `<ImportWarpingModal>`.

10. **Step 10 — Verification & Typecheck**:
    - Chạy `cmd /c npx tsc --noEmit` đạt 0 lỗi.
    - Test end-to-end import file `20-21.7.xlsx` sheet `WARPING`.

---

## Risks & Mitigation

| Risk | Mức độ | Biện pháp xử lý (Mitigation) |
|---|---|---|
| **Risk 1: 2 cột BEAM chưa rõ ý nghĩa nghiệp vụ thật** | **Cao** | Đặt tên placeholder `beamCount1`, `beamCount2` trong Prisma schema và UI. Đã ghi nhận rõ với Tung sẽ đổi tên field khi SNY xác nhận. |
| **Risk 2: Header máy viết không đồng nhất (`MACHINE 1`, `MACHINE  01`, `Machine 1`)** | **Trung bình** | Sử dụng Regex linh hoạt `/^MACHINE\s*(\d+)/i` và padZero thành `"WARP-01"`.."WARP-06"`. |
| **Risk 3: Các dòng tổng kết ngày ở cuối block (`TOTAL DAY`, `TOTAL NIGHT`, `SCRAP`, `%`) bị parse nhầm** | **Trung bình** | Lọc bỏ tất cả dòng có cell đầu chứa `TOTAL`, `SCRAP`, `%`, `DAY`, `NIGHT` mà không có shift `D`/`N` hợp lệ. |
| **Risk 4: Tên cột header trong Excel bị lệch vị trí** | **Thấp** | Tự động detect vị trí cột qua header row, fallback mặc định về 0..12 nếu thiếu header. |

---

## Manual Verification Checklist (Cho Tung sau khi Build Phase B)

1. Import file `20-21.7.xlsx` sheet `WARPING` qua UI modal.
2. Kiểm tra Preview hiển thị đúng 2 ngày: `2026-07-20` và `2026-07-21`.
3. Kiểm tra danh sách máy `WARP-01` đến `WARP-06` đủ 6 máy.
4. Kiểm tra cột `MÁY DỆT` hiển thị đúng giá trị (ví dụ máy dệt số `40`, `12`...).
5. Kiểm tra SUM(`weightKgs`) của một máy bất kỳ so với tổng cột WEIGHT trong file Excel gốc.
