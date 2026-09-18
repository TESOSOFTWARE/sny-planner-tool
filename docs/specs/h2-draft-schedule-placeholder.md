# SPEC H2: Draft Schedule Placeholder — Giữ chỗ sản xuất cho Đơn nháp (Phase A — Plan Only)

> **Document Status:** Phase A Specification & Plan — AWAITING USER APPROVAL  
> **Date:** 2026-08-02  
> **Sprint:** H2  

---

## 1. Audit Dữ liệu Cũ (Empirical Audit Results)

Đã chạy script audit thực tế trên Neon PostgreSQL Database:
* **Tổng số MachineAssignment hiện tại thuộc đơn nháp (`order.isDraft = true`)**: **146 assignments**.
* **Nguyên nhân**: Sprint F3 (bulk import Schedule tháng 7) đã gán 146 lịch sản xuất trực tiếp cho các đơn hàng import (vốn lưu ở trạng thái `isDraft = true`).
* **Mẫu bản ghi thực tế trong DB**:
  - `ID: cmrz1unma004a14fue5lybm1s` — Máy `M-040` — PI: `26HN0501` (SubLine 0) — Ngày: `2026-07-28` $\rightarrow$ `2026-07-29`
  - `ID: cmrz1unm9001j14fu10w8aig6` — Máy `M-017` — PI: `YUNA-GVT` (SubLine 0) — Ngày: `2026-07-27` $\rightarrow$ `2026-07-29`
  - `ID: cmrz1unm9003f14fu2hkva0bg` — Máy `M-033` — PI: `US26-2` (SubLine 0) — Ngày: `2026-07-22` $\rightarrow$ `2026-07-27`

---

## 2. Thay đổi Schema (`prisma/schema.prisma`)

Thêm trường `isPlaceholder` vào model `MachineAssignment`:

```prisma
model MachineAssignment {
  id                   String   @id @default(cuid())
  machineId            String   // e.g. "M-001" to "M-040"
  orderId              String
  order                ProductionOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  
  allocatedMeters      Decimal? @db.Decimal(10, 2)
  estimatedDailyOutput Decimal? @db.Decimal(10, 2)
  
  isPlaceholder        Boolean  @default(false) // true = Giữ chỗ tạm (đơn nháp), false = Lịch chính thức

  startDate            DateTime
  endDate              DateTime

  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  @@unique([machineId, startDate, orderId])
  @@map("machine_assignments")
}
```

### Chuyển đổi Tự động khi Duyệt Đơn Nháp (Approve Flow F1)
Trong route handler `POST /api/orders/[id]/approve/route.ts`:
Khi Planner duyệt đơn nháp (`isDraft` chuyển từ `true` $\rightarrow$ `false`), trong cùng một `prisma.$transaction`, tự động cập nhật tất cả `MachineAssignment` liên quan:
```typescript
prisma.machineAssignment.updateMany({
  where: { orderId: { in: piSubLineIds } },
  data: { isPlaceholder: false }
})
```

---

## 3. Logic Gán Máy cho Đơn Nháp (Assign Modal & Overlap Check)

### 3.1 Bỏ rào chắn chặn Đơn Nháp
* Trong `AssignModal.tsx` và `AssignFromOrderModal.tsx`:
  - Loại bỏ điều kiện chặn gán máy khi `order.isDraft === true`.
  - Cho phép chọn đơn nháp (ví dụ đơn nháp "Sunshine Sept Order") từ danh sách và tiến hành chọn máy + ngày gán.
* Khi gửi request `POST /api/assignments`:
  - Kiểm tra nếu `order.isDraft === true` $\rightarrow$ Tạo `MachineAssignment` với `isPlaceholder = true`.
  - Nếu `order.isDraft === false` $\rightarrow$ Tạo `MachineAssignment` với `isPlaceholder = false`.

### 3.2 Logic Check Trùng Lịch (Overlap Check 409)
* **Áp dụng Y HỆT Lịch Chính Thức**:
  - Thuật toán kiểm tra trùng thời gian (Overlap check) trong `POST /api/assignments` và `PATCH /api/assignments/[id]` giữ nguyên 100%.
  - Lịch giữ chỗ (`isPlaceholder = true`) **VẪN CHIẾM SLOT** trên máy và **VẪN BỊ CHẶN HTTP 409** nếu có đơn khác (dù là đơn thật hay đơn nháp khác) gán trùng máy & trùng ngày.
  - *Ý nghĩa nghiệp vụ*: Đúng nghĩa "Giữ chỗ" — khi đã đặt slot trên máy thì không đơn nào khác được đè lên.

---

## 4. Hiển thị Trực quan trên Schedule Grid

Khi render các ô assignment trên ma trận Lịch sản xuất (`/schedule`):

| Đặc điểm | Lịch Chính Thức (`isPlaceholder = false`) | Lịch Giữ Chỗ Tạm (`isPlaceholder = true`) |
| :--- | :--- | :--- |
| **Viền (Border)** | Viền nét liền (`border-solid border-primary`) | **Viền đứt nét (`border-dashed border-2 border-warning/80`)** |
| **Nền (Background)** | Màu xanh Navy / Primary chuẩn | **Màu vàng/cam nhạt (`bg-warning/10 hover:bg-warning/20`)** |
| **Badge / Icon** | Tên PI Number chuẩn | **Icon 📌 + Badge `[Nháp]` cạnh PI Number** |
| **Chữ (Text)** | Chữ đậm (`font-semibold text-on-primary`) | **Chữ màu cam/nâu (`font-medium text-warning-800`)** |
| **Hành vi Click** | Xem chi tiết assignment / Order Detail | **Xem chi tiết assignment / Dẫn tới Order Detail của Đơn Nháp** |

---

## 5. Script Backfill Đồng bộ Dữ liệu Cũ

Tạo script `scripts/backfill-draft-placeholders.ts` (chạy 1 lần sau khi push schema):
* Tìm toàn bộ 146 `MachineAssignment` cũ từ Sprint F3 đang gắn với `order.isDraft = true`.
* Cập nhật `isPlaceholder = true` cho cả 146 bản ghi này.
* *Kết quả*: Ngay sau khi deploy, toàn bộ 146 lịch của đơn nháp cũ trên Schedule Grid sẽ tự động hiển thị viền đứt nét `[Nháp]`, phân biệt hoàn toàn với lịch chính thức.

---

## 6. Đánh giá Rủi ro & Giải pháp (Risk Management)

1. **Rủi ro Xóa Đơn Nháp (Draft Order Deletion)**:
   - Model `MachineAssignment` đã có sẵn thiết lập `onDelete: Cascade` với `ProductionOrder`. Khi Planner xóa đơn nháp, toàn bộ lịch giữ chỗ `isPlaceholder = true` tương ứng sẽ **TỰ ĐỘNG BỊ XÓA THEO**, không để lại assignment mồ côi.
2. **Rủi ro Xung đột Overlap 409 giữa 2 Đơn Nháp**:
   - Nếu Planner cố tình gán 2 đơn nháp đè lên cùng 1 máy & khoảng ngày, hệ thống trả về lỗi 409 ngăn chặn ngay lập tức.
3. **Rủi ro Tiến độ Sản xuất (Progress Tracking)**:
   - Phân định `isPlaceholder` không làm ảnh hưởng tới Tiến độ Sản xuất Dệt (Progress Tracking vốn đã ẩn đối với đơn nháp từ Sprint F1).

---

## 7. Kế hoạch Xử lý (Phase B - Pending Approval)

1. **Push Schema**: Update `schema.prisma` với field `isPlaceholder` & `npx prisma db push`.
2. **Backfill**: Chạy script `scripts/backfill-draft-placeholders.ts` để gán `isPlaceholder = true` cho 146 record cũ.
3. **API & Logic**: Update `POST /api/assignments`, `POST /api/orders/[id]/approve`, `AssignModal.tsx`, `AssignFromOrderModal.tsx`.
4. **UI Grid**: Update styling cho cell `isPlaceholder = true` (border-dashed, bg-warning/10, badge `[Nháp]`).
5. **Verify**: Build `npm run build` (0 error) & test tạo giữ chỗ thật cho đơn "Sunshine Sept Order".
