# E3 Knitting Daily Detail — Implementation Plan (PLAN ONLY)

## Goal

Thêm module **Knitting Daily Detail** (theo dõi chi tiết ca/màu/đơn hàng và thông số vận hành của 40 máy dệt `M-001` đến `M-040`):
- Parse sheet `KNITTING` (file `20-21.7.xlsx` ~967 dòng) chứa dữ liệu chi tiết của 40 máy dệt.
- Lưu vào DB model mới `KnittingDailyDetail`.
- Phục vụ Sprint D (hiển thị thông số dàn máy trên trang Schedule).
- Tích hợp sub-tab **Knitting Detail** vào trang `/materials`.

> [!CAUTION]
> **ĐIỀU KIỆN BẮT BUỘC / BẢO VỆ DỮ LIỆU ĐANG CHẠY LIVE:**
> Hệ thống ĐÃ CÓ model `KnittingDailyOutput` (tổng mét/máy/ngày) đang phục vụ tính năng Tiến độ sản xuất (Progress Tracking) live trên Order Detail + PO Summary.
> **TUYỆT ĐỐI KHÔNG sửa, KHÔNG xóa, KHÔNG thay đổi schema của `KnittingDailyOutput`**. Model `KnittingDailyDetail` chạy hoàn toàn ĐỘC LẬP và SONG SONG.

---

## File Tree (new & modified files)

### New files
```
prisma/
  schema.prisma                                    ← [MODIFY] thêm model KnittingDailyDetail

src/lib/excel/
  parseKnittingDetailReport.ts                     ← [NEW] parser sheet KNITTING chi tiết

src/app/api/knitting/detail/
  import/route.ts                                  ← [NEW] POST preview (no DB write)
  import/confirm/route.ts                          ← [NEW] POST confirm (Option B delete-then-insert)
  records/route.ts                                 ← [NEW] GET list (filter by date, machineId, pagination)
  template/route.ts                                ← [NEW] GET download template .xlsx

src/components/materials/
  ImportKnittingDetailModal.tsx                    ← [NEW] 3-step modal (upload → preview → confirm)
  KnittingDetailTab.tsx                            ← [NEW] tab UI (bảng + filter + summary cards + header)

src/app/materials/page.tsx                        ← [MODIFY] tích hợp tab KNITTING DETAIL vào tab bar
```

---

## Prisma Model Proposal (`KnittingDailyDetail`)

```prisma
model KnittingDailyDetail {
  id             String   @id @default(cuid())

  // Dùng LUÔN format "M-001".."M-040" — khớp trực tiếp với 40 máy dệt trên Schedule
  machineId      String   // "M-001" to "M-040"

  reportDate     DateTime // UTC midnight (timezone-independent)
  shift          String   // "D" (ca ngày) hoặc "N" (ca đêm)

  width          Decimal? @db.Decimal(10, 2)
  color          String   // tên màu
  weightSpec     Decimal? @db.Decimal(10, 2) // cột weight (gsm/spec)
  lengthM        Decimal? @db.Decimal(10, 2) // cột length(m)
  tapeRoll       Decimal? @db.Decimal(10, 2) // cột tape/roll
  mValue         Decimal? @db.Decimal(10, 2) // cột m
  avgPerRoll     Decimal? @db.Decimal(10, 2) // cột average/roll
  quantity       Decimal? @db.Decimal(10, 2) // cột quantity
  weightKgs      Decimal  @db.Decimal(10, 2) // cột weight(kg)

  orderRef       String?  // Mã PI / đơn hàng (nếu Remark không bắt đầu bằng "*")
  machineNote    String?  // Ghi chú vận hành máy (nếu Remark bắt đầu bằng "*")

  // Thông số năng suất & kích thước cấp máy/ngày (trích xuất từ hàng header/sub-header máy)
  machineSizeM   Decimal? @db.Decimal(10, 2) // SIZE OF MACHINE(M) (vd 6.56, 6.85, 4.6)
  cmPerMin       Decimal? @db.Decimal(10, 2) // Qty of Netting Cm/per min (vd 96, 108, 126)
  meterPerDay    Decimal? @db.Decimal(10, 2) // Qty of Netting Meter/per day (vd 1382.4, 1814.4)
  operatingGrade String?                      // Operating grade (vd "A", "B")
  totalPct       Decimal? @db.Decimal(5, 2)  // Total % (vd 98.5)

  dataSource     String   @default("import")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([machineId])
  @@index([reportDate])
  @@map("knitting_daily_detail")
}
```

---

## Xử Lý Các Rủi Ro & Edge Cases Đã Kiểm Tra Từ File Thật (`20-21.7.xlsx`)

### 1. EDGE CASE ĐẶC BIỆT — Vị trí cột `SIZE OF MACHINE (M)` và thông số năng suất
- **Hiện trạng kiểm tra thực tế**:
  - **Máy 1 (`MACHINE 1`)**: Là ngoại lệ duy nhất. Dòng header `MACHINE 1` chỉ chứa tên máy và ngày. Các thông số `machineSizeM`, `cmPerMin`, `meterPerDay`, `operatingGrade`, `totalPct` của Máy 1 nằm ở **dòng tiêu đề cột / dòng dữ liệu ngay bên dưới**.
  - **Máy 2 đến Máy 40 (`MACHINE 2` .. `MACHINE 40`)**: Kích thước máy (vd `6.56`, `6.85`, `4.6`) nằm ở **cột 1 ngay trên cùng hàng header** với chuỗi `"MACHINE X"`. Các thông số năng suất (`cmPerMin`, `meterPerDay`) nằm ở cột 15 và 16 trên cùng hàng header này.
- **Giải pháp Parser**:
  - Xử lý riêng ngoại lệ Máy 1: Nếu là `MACHINE 1`, đọc thông số cấp máy từ dòng cột ngay bên dưới.
  - Các máy từ `MACHINE 2` đến `MACHINE 40`: Đọc `machineSizeM` từ `row[1]`, `cmPerMin` từ `row[15]`, và `meterPerDay` từ `row[16]` của chính hàng header máy đó.
  - Gán toàn bộ thông số cấp máy này cho tất cả bản ghi thuộc block máy đó.

### 2. Quy Tắc Lọc Dòng Data (Filtering Rule) — Bỏ dòng rỗng/template
- **Quy tắc**: Chỉ lưu các dòng có `color` hợp lệ VÀ `weightKgs > 0` (hoặc có thông tin đơn/ca thực sự, tương tự Warping).
- **Bỏ hẳn dòng rỗng/template**: KHÔNG lưu các dòng rỗng hoặc `weightKgs = 0` không có màu (khác Extruder) để tránh phình dữ liệu DB khi xử lý quy mô 40 máy dệt.

### 3. Phân Tách Cột `Remark`
- **Giải pháp Heuristic**:
  - Nếu chuỗi text bắt đầu bằng ký tự `*` (ví dụ `* Thay 2 dàn, đổi màu: 00h30'-02h30' (N)`) → gán cho `machineNote`, gán `orderRef = null`.
  - Ngược lại (ví dụ `JPY26-274`, `GBN26-110`) → gán cho `orderRef`, gán `machineNote = null`.

---

## Cấu Trúc Sheet Excel & Rules Chuẩn

1. **Multi-day blocks**:
   - Phát hiện dòng chứa `"SNY VINA CO.,LTD."` → reset `currentDate`.
   - Đọc ngày báo cáo tại ô date (Excel serial number hoặc date string) ở các dòng ngay kế tiếp.

2. **Machine IDs**:
   - Header dạng `MACHINE 1` .. `MACHINE 40`.
   - Trích xuất số máy `N` → format thành `M-001` .. `M-040` (khớp 100% với mã máy dệt trong bảng Schedule).

3. **Cấu trúc cột data row (0-indexed)**:
   - `col 1`: `SIZE OF MACHINE` (đã trích xuất ở level block)
   - `col 2`: `NO.` / `shift` ("D" / "N")
   - `col 3`: `width`
   - `col 4`: `color`
   - `col 5`: `weight` (weightSpec / gsm)
   - `col 6`: `length(m)`
   - `col 7`: `tape/roll`
   - `col 8`: `m`
   - `col 9`: `average/roll`
   - `col 10`: `quantity`
   - `col 11`: `weight(kg)` (weightKgs - **LƯU VÀO DB**)
   - `col 12`: `total(kg)` (**KHÔNG LƯU DB**, chỉ cross-check)
   - `col 13`: `total(m)` (**KHÔNG LƯU DB**)
   - `col 14`: `Remark` (phân tách thành `orderRef` hoặc `machineNote`)

4. **Rule Idempotent Option B**:
   - Trước khi insert dữ liệu mới, thực hiện transaction xóa tất cả bản ghi cũ trong `knitting_daily_detail` có cùng `[machineId, reportDate]`.

---

## Ước Tính Quy Mô & Số Bản Ghi Thực Tế

- File test `20-21.7.xlsx` sheet `KNITTING` có **967 dòng**.
- Bao gồm **2 ngày** (`2026-07-20` và `2026-07-21`) × **40 máy** (`M-001` đến `M-040`).
- Sau khi áp dụng quy tắc lọc bỏ dòng rỗng/template (chỉ giữ dòng có màu + sản lượng), dự kiến tổng số record lưu DB khoảng **300 - 450 bản ghi**.

---

## 10 Steps Thực Hiện Phase B (Build)

1. **Step 1 — Schema Migration**:
   - Cập nhật `prisma/schema.prisma` với model `KnittingDailyDetail`.
   - Chạy `cmd /c npx prisma db push`.

2. **Step 2 — Parser `parseKnittingDetailReport.ts`**:
   - Viết parser xử lý reset ngày theo `"SNY VINA CO.,LTD."`.
   - Xử lý edge case Máy 1 (đọc size/thông số từ dòng bên dưới) và Máy 2-40 (đọc size/thông số từ cùng hàng header máy).
   - Lọc bỏ dòng template rỗng (chỉ giữ dòng có color + weightKgs > 0).
   - Phân tách `Remark` thành `orderRef` / `machineNote`.
   - Viết test script `scripts/test-import-real-knitting-detail.ts` chạy thử trên `20-21.7.xlsx`.

3. **Step 3 — Import Preview API**:
   - `POST /api/knitting/detail/import` — nhận file `.xlsx`, trả về preview (số records, dates, machines, tổng kg, tổng mét).

4. **Step 4 — Import Confirm API**:
   - `POST /api/knitting/detail/import/confirm` — thực hiện transaction xóa records cũ theo `[machineId, reportDate]` rồi insert bản ghi mới (Option B).

5. **Step 5 — Records GET API**:
   - `GET /api/knitting/detail/records` — hỗ trợ query theo `date`, `machineId`, phân trang.

6. **Step 6 — Template Download API**:
   - `GET /api/knitting/detail/template` — generate file mẫu `.xlsx` chuẩn cấu trúc Knitting Detail.

7. **Step 7 — Modal Import `ImportKnittingDetailModal.tsx`**:
   - UI 3 bước (Upload → Preview tổng quan + danh sách ngày + máy → Confirm).

8. **Step 8 — Component Tab `KnittingDetailTab.tsx`**:
   - UI bảng dữ liệu chi tiết Knitting (hiển thị 15+ cột: Máy, Ca, Màu, Khổ, Trọng lượng kg, Mét, Thông số máy, Ghi chú vận hành, Mã PI).
   - Bộ lọc Ngày & Máy (`M-001` đến `M-040`).
   - Thẻ thống kê Summary Cards.

9. **Step 9 — Tích Hợp Trang `/materials`**:
   - Cập nhật `src/app/materials/page.tsx` hỗ trợ sub-tab `KNITTING DETAIL`.

10. **Step 10 — Verification & Typecheck**:
    - Chạy `cmd /c npx tsc --noEmit` đạt 0 lỗi.
    - Test end-to-end import file `20-21.7.xlsx` sheet `KNITTING`.

---

## Risks & Mitigation

| Risk | Mức độ | Biện pháp xử lý (Mitigation) |
|---|---|---|
| **Risk 1: Đụng chạm hoặc làm hỏng `KnittingDailyOutput`** | **CRITICAL** | **Tách biệt 100%**: Tạo model mới `KnittingDailyDetail`, tạo API & component riêng (`/api/knitting/detail/...`). Không chỉnh sửa bất kỳ dòng code nào liên quan đến `KnittingDailyOutput` hay `/api/knitting/import`. |
| **Risk 2: Xử lý sai edge case Máy 1 vs Máy 2-40** | **Cao** | Xử lý điều kiện riêng cho Máy 1 (đọc size/thông số từ dòng bên dưới) thay vì hardcode 1 quy tắc chung. |
| **Risk 3: `Remark` phân loại sai giữa mã PI và ghi chú vận hành** | **Trung bình** | Sử dụng regex/heuristic kiểm tra ký tự `*` đầu chuỗi hoặc từ khóa vận hành (`Thay dàn`, `Đổi màu`). |
| **Risk 4: Phình dữ liệu DB do dòng rỗng** | **Thấp** | Lọc bỏ toàn bộ dòng template rỗng (chỉ giữ dòng có màu + sản lượng > 0). |

---

## Manual Verification Checklist (Cho Tung sau khi Build Phase B)

1. Kiểm tra Tiến độ sản xuất (Progress Tracking) trên Order Detail và PO Summary vẫn hoạt động bình thường (không bị ảnh hưởng bởi Sprint E3).
2. Import file `20-21.7.xlsx` sheet `KNITTING` qua modal `ImportKnittingDetailModal`.
3. Kiểm tra Preview hiển thị đúng 2 ngày (`2026-07-20` và `2026-07-21`) và đủ 40 máy dệt (`M-001` đến `M-040`).
4. Kiểm tra Máy 1 đọc đúng kích thước máy (dòng bên dưới header) và Máy 2-40 đọc đúng kích thước từ chính dòng header (vd 6.56, 6.85).
5. Kiểm tra máy `M-004` ngày 20/07/2026 có `machineNote` = `"* Thay 2 dàn, đổi màu: 00h30'-02h30' (N)"`.
