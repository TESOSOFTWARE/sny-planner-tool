# SPEC G1-G3: Order Journey — Link Data, Loss Formula & PO Summary Display (Phase A — Plan Only)

> **Document Status:** Phase A Audit & Risk Report — STOPPED FOR USER REVIEW  
> **Date:** 2026-07-25  
> **Sprint:** G1-G3  

---

## 1. Kết quả Thống kê Thực tế trên Database (Empirical Audit)

Script audit đọc toàn bộ dữ liệu hiện có trên Neon DB (không sửa/ghi DB) với logic chuẩn hóa: `trim()`, `toUpperCase()`, xóa khoảng trắng dư thừa, tách mã PI từ chuỗi có ghi kèm tên sản phẩm (vd `"Cvellis26-2 - GRAIN NET"` → `"CVELLIS26-2"`).

### 1.1 Tổng quan ProductionOrder
- **Tổng số ProductionOrder trong DB**: 87 dòng (tương ứng **65 PI Number** duy nhất).
- **PI đơn (Chỉ có 1 sub-line - Unambiguous)**: **59 PI (90.8%)** → Đủ điều kiện tự động gán `orderId`.
- **PI đa dòng (>1 sub-line - Ambiguous)**: **6 PI (9.2%)** → Theo rule, `orderId` sẽ để `null` (không đoán).

### 1.2 Thống kê chi tiết theo 3 bảng Báo cáo Daily Output

| Bảng dữ liệu | Tổng số dòng | Dòng có orderRef | Khớp DB PI (Matched) | Khớp PI Đơn (Auto-Link orderId) | Không khớp DB (Unmatched) | Tỷ lệ Unmatched (trên dòng có ref) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **ExtruderDailyOutput** *(Kéo sợi)* | 60 | 22 | **22 (100.0%)** | 20 (90.9%) | **0 (0.0%)** | **0.0%** ✅ |
| **WarpingDailyOutput** *(Cuốn sợi)* | 14 | 14 | **6 (42.9%)** | 6 (42.9%) | **8 (57.1%)** | **57.1%** ⚠️ |
| **KnittingDailyDetail** *(Dệt chi tiết)* | 298 | 84 | **46 (54.8%)** | 40 (47.6%) | **38 (45.2%)** | **45.2%** ⚠️ |
| **TỔNG CỘNG 3 BẢNG** | **372** | **120** | **74 (61.7%)** | **66 (55.0%)** | **46 (38.3%)** | **38.3%** ⚠️ |

### 1.3 Danh sách mẫu các orderRef KHÔNG khớp được trong DB
1. **WarpingDailyOutput**:
   - `KSSNY205` (6 dòng) — Mã PI tháng khác/chưa được tạo trong `ProductionOrder`.
   - `26LCS0701` (2 dòng) — Mã PI chưa có trong DB.
2. **KnittingDailyDetail**:
   - `LANDSKOON 26-2` (Sai chính tả Excel: trong DB lưu `LANDSKRON 26-2`).
   - `ITM 26`, `KSSNY`, `RICKY`, `SHADE NET MONO`, `SHADE NET MONO TAPE` — Tên quy ước chung / chủng loại lưới, không phải mã PI cụ thể.
   - `US26-2`, `HAIL GUARD NET`, `SCNETTING 26-2`, `VGC26-4` — Các mã PI đơn hàng cũ/mới chưa được Planner tạo trên hệ thống.

---

## 2. Cảnh báo Ngưỡng Rủi ro (30% Unmatched Threshold)

> [!WARNING]
> **Tỷ lệ Unmatched tổng thể hiện tại là 38.3% (> Ngưỡng 30% đề ra).**
> 
> **Hậu quả nghiệp vụ nếu build hiển thị ngay:**
> - Khoảng **38.3% số dòng báo cáo sản xuất** sẽ không gán được `orderId`.
> - Trên màn hình **PO Summary (`/orders/summary`)**, các đơn hàng tương ứng sẽ hiển thị **"0%"** ở cột Cuốn (Warping) hoặc Dệt (Knitting) dù thực tế nhà xưởng đã chạy sản xuất. Điều này có thể gây hiểu nhầm cho khách hàng (Ông Kim / Loan).

---

## 3. Thiết kế Kỹ thuật Đề xuất (Phase A Proposal)

### 3.1 Công thức Loss Factor (Hào hụt Kéo sợi)
Công thức đã CONFIRMED với Dung (Planner):
$$\text{requiredYarnKg} = \text{totalWeightKgs} \times 1.05$$
*(Cộng thêm 5% hao hụt vào trọng lượng thành phẩm, nguyên liệu Kéo sợi đầu vào > thành phẩm Dệt cuối).*

#### Schema update (`ProductionOrder`):
- Thêm trường `requiredYarnKg Decimal? @db.Decimal(10, 2)` vào `ProductionOrder`.
- Tự động tính toán lại `requiredYarnKg` ngay trong hàm `calculateOrderWeight()` bất kỳ khi nào `qtySqm` hoặc `totalWeightKgs` thay đổi (không tạo luồng riêng).

### 3.2 Schema update cho 3 bảng Báo cáo Output
Thêm trường `orderId String?` (FK tới `ProductionOrder.id` với `onDelete: SetNull`) vào cả 3 model:
1. `ExtruderDailyOutput` (`orderId String?`)
2. `WarpingDailyOutput` (`orderId String?`)
3. `KnittingDailyDetail` (`orderId String?`)

*Lưu ý: GIỮ NGUYÊN các trường text gốc `orderRef`, `beamNote`, `machineNote` để tham khảo audit trail, không xóa.*

### 3.3 Quy tắc Auto-matching & Backfill Script
Khi import Excel mới hoặc chạy script backfill:
1. Chuẩn hóa `orderRef` (trim, uppercase, loại bỏ khoảng trắng & tên phụ kiện lưới).
2. Tìm trong bảng `ProductionOrder`:
   - Nếu match đúng 1 dòng PI (**Single sub-line**) → Gán `orderId = ProductionOrder.id`.
   - Nếu match PI có **nhiều sub-lines (>1 sub-line)** → Gán `orderId = null` (chờ tính năng gán dòng thủ công sau, không đoán mò).
   - Nếu không match → Gán `orderId = null`.

### 3.4 Hiển thị Hành trình trong PO Summary (`POSummaryTable.tsx`)
Hiển thị section **"Hành trình sản xuất"** trên từng card PI Group (chỉ hiện khi `requiredYarnKg > 0`):
- **Kéo sợi**: $\frac{\sum \text{ExtruderDailyOutput.weightKgs (where orderId = X)}}{\text{requiredYarnKg}} \times 100\%$
- **Cuốn sợi**: $\frac{\sum \text{WarpingDailyOutput.weightKgs (where orderId = X)}}{\text{requiredYarnKg}} \times 100\%$
- **Dệt vải**: Sử dụng lại Tiến độ Dệt hiện tại từ `KnittingDailyOutput` (giữ nguyên logic gốc).
- **Đóng gói**: Để rỗng / ẩn (chưa có module).

---

## 4. Trạng thái Hiện tại & Dừng chờ Chỉ đạo

> [!IMPORTANT]
> Theo đúng chỉ thị của Sprint G1-G3, Antigravity **DỪNG LẠI TẠI ĐÂY (PHASE A)** sau khi ghi nhận tỷ lệ Unmatched = 38.3% (> 30%).
> 
> **Chờ quyết định của Tung:**
> 1. Đồng ý tiếp tục tiến hành Phase B (Build Schema + Script Backfill + PO Summary UI Journey) với tỷ lệ match Kéo sợi 100%, Dệt 55%, Cuốn 43%?
> 2. Hay yêu cầu Planner (Dung) chuẩn hóa lại mã PI trên các file Excel báo cáo trước khi build?
