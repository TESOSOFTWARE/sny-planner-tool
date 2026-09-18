# SPEC F4: Bulk-Edit PI & Customer ColorPreset (Phase A — Plan Only)

> **Document Status:** Draft for User Approval (Tung)  
> **Date:** 2026-07-25  
> **Sprint:** F4  

---

## 1. Tổng quan mục tiêu Nhóm 2

Sprint F4 Nhóm 2 tập trung vào 2 tính năng chính liên quan đến quy trình quản lý đơn hàng & tối ưu trải nghiệm nhập liệu của Planner (Dung):

1. **Bulk-edit PI Number (Sửa chung PO)**: Cho phép cập nhật nhanh các thông tin chung của tất cả sub-lines thuộc cùng một `piNumber` từ màn hình `/orders/summary`.
2. **ColorPreset theo Khách hàng**: Tự động gợi ý danh sách Màu, MB Code, Số kim (Wale), Số lines Eyelet tiêu chuẩn của từng Khách hàng khi tạo đơn hàng mới trên `MultiLineOrderForm.tsx`.

---

## 2. Thiết kế Kỹ thuật Chi tiết

### 2.1 Bulk-edit PI Number (Sửa chung PO)

#### UI Flow (`/orders/summary`)
- Tại mỗi card/nhóm `piNumber` trong `POSummaryTable.tsx`, thêm nút **"Sửa chung PO"** cạnh PI Number header.
- Khi bấm nút, mở modal `BulkEditPOModal.tsx`.
- Form modal **CHỈ CHỨA các thông tin chung (Shared Fields)**:
  - `Customer` (Khách hàng) — autocomplete chọn từ DB
  - `Order Date` (Ngày đặt hàng)
  - `Delivery Date` (Ngày giao hàng)
  - `Container Size` (Kích thước container)
  - `Description` (Mô tả đơn hàng)
  - `Remark` (Ghi chú nội bộ)
  - ⚠️ **KHÔNG chứa các field per-line** (Color, Width, GSM, Length, Qty, MB Code, FR%, Eyelet...).

#### Backend API (`PATCH /api/orders/bulk-edit-pi`)
- **Payload**:
  ```ts
  {
    piNumber: string,
    data: {
      customer: string,
      customerId?: string | null,
      orderDate: string,
      deliveryDate?: string | null,
      containerSize?: string | null,
      description?: string | null,
      remark?: string | null,
    }
  }
  ```
- **Transaction execution**:
  - Tìm tất cả `ProductionOrder` có `piNumber = payload.piNumber` (case-insensitive).
  - Chạy `prisma.$transaction` để `updateMany` (hoặc update từng record nếu cần trigger logic weight recalculation khi orderDate đổi).
  - Đảm bảo **Atomic Rollback**: Nếu có bất kỳ lỗi nào xảy ra trong quá trình update, toàn bộ giao dịch sẽ rollback và trả lỗi HTTP 500 / 400.

---

### 2.2 ColorPreset theo Khách hàng

#### Phân tích Dữ liệu Khách hàng `INTERWAY` trong DB (Empirical Audit)
Hiện tại trong Database (Bảng `Customer` và `ProductionOrder`) đang tồn tại 2 tên khách hàng:
1. `INTERWAY IND. CO., LTD` (Customer ID: `cmro8smpz000110wh7kjsfeh4`)
2. `INTERWAY GLOBAL CO., LTD` (Customer ID: `cmrvsi7mj0000z37pqvlamasm` — có note *"ĐƠN HÀNG ARGOS"*, Contact: *MR. JAY*, Country: *KOREA*)

> [!IMPORTANT]
> **Xác nhận với Tung trước khi Seed**: Bảng màu Dung gửi ghi tên khách hàng là `"INTERWAY GLOBAL (ARGOS)"`.
> Trong DB đã có `INTERWAY GLOBAL CO., LTD` (note: ĐƠN HÀNG ARGOS).
> **Khuyến nghị**: Match `ColorPreset` trực tiếp vào Customer `INTERWAY GLOBAL CO., LTD` (ID `cmrvsi7mj0000z37pqvlamasm`).

#### Schema Model mới (`prisma/schema.prisma`)
```prisma
model ColorPreset {
  id          String   @id @default(cuid())
  customerId  String   // FK Customer.id
  customer    Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  
  color       String   // e.g. "BLACK", "DARK GREEN", "BEIGE"
  mbCode      String?  // e.g. "7079", "MYD4501A"
  mbSupplier  String?  // Nhà cung cấp hạt màu (e.g. "KOREA", "TAIWAN")
  wale        Int?     // Số kim / mật độ (gợi ý điền needleCount)
  cours       Int?     // Mật độ hàng kim (bổ sung spec)
  eyeletColor String?  // e.g. "BLACK", "SILVER"
  eyeletLines Int?     // Số hàng khoen (e.g. 2, 4)
  note        String?  // PO reference tham khảo (e.g. "ARGOS 2026")

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([customerId, color, mbCode])
  @@index([customerId])
  @@map("color_presets")
}
```

#### Seed Data 14 Mẫu màu Dung gửi (`INTERWAY GLOBAL CO., LTD`)
1. Black / 7079 (Wale 192, Eyelet Lines 2)
2. Dark Green / MYD4501A (Wale 192, Eyelet Lines 2)
3. Beige 6# / LS309315 (Wale 192, Eyelet Lines 2)
... (seed đủ 14 dòng vào DB qua script `prisma/seed-color-presets.ts`).

#### Integration trên UI `MultiLineOrderForm.tsx`
1. **Fetch presets**: Khi chọn hoặc điền Customer, hệ thống tự động fetch `GET /api/customers/[id]/color-presets` (hoặc theo customer name).
2. **Autocomplete Color**:
   - Trường `Màu (Color)` ở mỗi dòng hiển thị dạng Autocomplete input.
   - Khi focus/gõ, gợi ý các màu có trong `ColorPreset` của khách đó.
   - Vẫn cho phép nhập tự do nếu là màu mới.
3. **Auto-fill thông số**:
   - Khi Planner chọn 1 item từ danh sách gợi ý ColorPreset:
     - Tự động điền `mbCode` (nếu đang trống).
     - Tự động điền `needleCount` từ `wale` (nếu đang trống).
     - Tự động bật `hasEyelet = true` và điền `eyeletLines` (nếu preset có `eyeletLines` và form đang trống).

#### Khuyến nghị về UI Quản lý ColorPreset
> [!TIP]
> **Khuyến nghị**: **Chưa xây dựng màn hình UI quản lý ColorPreset riêng ở Sprint F4**.
> Lý do: Tần suất thay đổi bảng màu chuẩn của mỗi khách hàng rất thấp (vài tháng/năm 1 lần). Việc seed data ban đầu + cung cấp API GET/POST cơ bản giúp hoàn thành tính năng nhanh chóng, tiết kiệm chi phí UI. Khi có khách hàng mới, dev/planner có thể thêm preset dễ dàng qua script hoặc API route.

---

## 3. Câu hỏi Xác nhận dành cho Tung (User Review Required)

> [!IMPORTANT]
> **Q1**: Bảng màu Dung gửi cho khách *"INTERWAY GLOBAL (ARGOS)"* sẽ được liên kết với Customer `INTERWAY GLOBAL CO., LTD` (đã có trong DB với ghi chú *"ĐƠN HÀNG ARGOS"*). Tung xác nhận đây là cùng 1 khách hàng?
> 
> **Q2**: Tung có đồng ý với khuyến nghị **Chưa làm UI quản lý ColorPreset riêng ở Sprint F4**, chỉ làm API + Autocomplete gợi ý trên `MultiLineOrderForm` + Seed 14 màu chuẩn cho Interway?

---

## 4. Verification Plan

### Automated Tests / Scripts
- Run `npm run build` để đảm bảo schema mới và API mới không gây type error.
- Test script kiểm tra transaction rollback của Bulk-edit PI.

### Manual Verification
1. Mở `/orders/summary`, bấm "Sửa chung PO" cho 1 PI, đổi Customer/Date, xác nhận tất cả sub-lines được cập nhật đồng bộ.
2. Mở `/orders/new-multi`, chọn khách hàng `INTERWAY GLOBAL CO., LTD`, chọn màu `BLACK` từ gợi ý → kiểm tra MB Code `7079` và Số kim `192` tự điền.
