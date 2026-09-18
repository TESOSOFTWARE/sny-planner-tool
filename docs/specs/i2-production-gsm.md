# Sprint I2: GSM Sản Xuất Thực Tế (Spec & Design)

## 1. Tổng Quan & Mục Tiêu
Nhiều sản phẩm dệt (đặc biệt các dòng Shade Net M+T) cần được sản xuất ở mức GSM thực tế **cao hơn** GSM ghi trên đơn hàng (Proforma Invoice - PI) nhằm bù đắp độ co giãn hoặc đạt trọng lượng kiểm định tối thiểu (circle weight).
- **GSM đơn hàng (`gsm`)**: Thông số ghi trên PO/PI hiển thị cho khách hàng.
- **GSM sản xuất thực tế (`productionGsm`)**: Thông số dệt thực tế tại xưởng, dùng làm căn cứ tính nhu cầu nguyên liệu sợi (`requiredYarnKg`).

Sprint I2 bổ sung trường `productionGsm` (tùy chọn) vào hệ thống để tính toán chính xác số lượng sợi cần cấp cho xưởng mà không làm sai lệch trọng lượng và diện tích đối chiếu với khách hàng.

---

## 2. Thiết Kế Schema & Thuật Toán Tính Toán

### 2.1 Schema Database (`prisma/schema.prisma`)
Bổ sung 1 trường mới vào model `ProductionOrder`:
```prisma
model ProductionOrder {
  // ...
  gsm           Int?  // GSM đơn hàng (hiển thị cho khách)
  productionGsm Int?  // GSM sản xuất thực tế (dùng tính nhu cầu sợi nội bộ) — optional, nullable
  // ...
}
```
- **Tính tương thích**: Trường `productionGsm` hoàn toàn tùy chọn (`Int?`). Tất cả 119+ đơn hàng lịch sử đều có `productionGsm = null`, hệ thống tự động sử dụng `gsm` gốc, **0% rủi ro breaking change**.

### 2.2 Đơn Vị Tính Toán Duy Nhất (`src/lib/calculations/orderWeight.ts`)
Cập nhật hàm tính toán `calculateOrderWeight(input)`:

```ts
export interface OrderWeightInput {
  orderType: string
  widthM?: number | null
  lengthM?: number | null
  gsm?: number | null
  productionGsm?: number | null // MỚI: GSM sản xuất thực tế
  qty?: number | null
  rollLength?: number | null
  pieceLength?: number | null
}

export function calculateOrderWeight(input: OrderWeightInput): OrderWeightResult {
  // 1. Tính tổng mét & diện tích m² (qtySqm) — GIỮ NGUYÊN
  // ...
  
  // 2. Trọng lượng đơn hàng cho khách (totalWeightKgs) — KHÔNG ĐỔI (dùng gsm đơn hàng)
  const totalWeightKgs = input.gsm ? (qtySqm * input.gsm) / 1000 : null

  // 3. Nhu cầu nguyên liệu sợi nội bộ (requiredYarnKg) — DÙNG productionGsm NẾU CÓ
  const effectiveYarnGsm = input.productionGsm ?? input.gsm
  const requiredYarnKg = effectiveYarnGsm ? ((qtySqm * effectiveYarnGsm) / 1000) * 1.05 : null

  return { totalMeters, qtySqm, totalWeightKgs, requiredYarnKg }
}
```

---

## 3. Giao Diện Người Dùng (UI/UX)

### 3.1 Form Tạo & Sửa Đơn Hàng (`MultiLineOrderForm.tsx`)
- Đặt trường **"GSM sản xuất thực tế"** nằm ngay bên cạnh trường **"GSM (đơn hàng)"**.
- Nhãn hiển thị: `GSM thực tế (nếu khác GSM đơn)`.
- Placeholder: `Để trống nếu giống GSM đơn`.
- Khi người dùng nhập `productionGsm` $\rightarrow$ Thẻ xem trước hiển thị live nhu cầu sợi `requiredYarnKg` được tính theo `productionGsm`, trong khi `totalWeightKgs` vẫn tính theo `gsm` gốc.

### 3.2 Trang Chi Tiết Đơn Hàng (`OrderDetail.tsx`)
- Tại mục Thông số kỹ thuật:
  - **GSM đơn hàng**: Hiển thị `gsm` (ví dụ: `325 gsm`).
  - **GSM sản xuất thực tế**: Hiển thị `productionGsm` (ví dụ: `340 gsm`) hoặc `— (giống GSM đơn)` nếu rỗng.
  - **Nhu cầu sợi (kg)**: Hiển thị `requiredYarnKg` (tính theo `productionGsm` nếu có).

---

## 4. Phân Tích Rủi Ro (Risk Analysis)

| Đối tượng | Trạng thái | Giải thích |
| :--- | :--- | :--- |
| `qtySqm` (Diện tích m²) | **KHÔNG ĐỔI 100%** | Tính thuần túy theo Khổ × Tổng mét, không phụ thuộc GSM. |
| `totalWeightKgs` (Trọng lượng PO) | **KHÔNG ĐỔI 100%** | Giữ nguyên công thức `qtySqm × gsm / 1000` để đối chiếu hợp đồng khách hàng. |
| 119+ Đơn hàng cũ | **TỰ ĐỘNG KHỚP 100%** | Do `productionGsm = null`, toán tử `productionGsm ?? gsm` trả về `gsm`, nhu cầu sợi giữ nguyên kết quả cũ. |
