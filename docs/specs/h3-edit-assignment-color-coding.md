# Sprint H3: Sửa Lịch Trực Tiếp & Tô Màu Theo PI (Spec & Design)

## 1. Tổng Quan & Mục Tiêu
Sprint H3 giải quyết 2 phản hồi trực tiếp từ Planner (Dung):
1. **Sửa lịch trực tiếp**: Khi đổi máy hoặc đổi ngày của 1 lịch dệt đã gán, không cần phải **Xóa $\rightarrow$ Gán lại**. Cho phép sửa trực tiếp máy, ngày bắt đầu, ngày kết thúc và cập nhật DB (PATCH assignment cũ).
2. **Tô màu theo PI Number**: Thay vì toàn bộ bảng màu xanh lam mặc định làm rối mắt, mỗi PI Number được gán **1 màu sắc cố định (deterministic color)** dựa trên mã PI. Giúp Planner nhìn lướt là phân biệt ngay các đơn hàng đang dệt ở máy nào.

---

## 2. Phần 1: Sửa Assignment Trực Tiếp (`PATCH /api/assignments/[id]`)

### 2.1 Cập nhật API `PATCH /api/assignments/[id]`
Hiện tại `PATCH /api/assignments/[id]` chỉ hỗ trợ đổi `orderId`, `endDate`, `estimatedDailyOutput`. 
Trong Sprint H3, API sẽ mở rộng hỗ trợ cập nhật:
- `machineId` (Chuyển đơn sang máy dệt khác)
- `startDate` & `endDate` (Đổi khoảng thời gian chạy dệt)
- `orderId` (Đổi đơn hàng)

#### Quy tắc Overlap Check (409) khi Sửa:
- Phép kiểm tra trùng lịch (Overlap Check) sẽ quét tìm assignment khác có thời gian đè lên `[startDate, endDate]` trên cùng `machineId`.
- **ĐIỀU KIỆN QUAN TRỌNG**: Bắt buộc thêm `id: { not: currentAssignmentId }` vào câu truy vấn Prisma để **LOẠI TRỪ CHÍNH NÓ**.
```ts
const overlap = await prisma.machineAssignment.findFirst({
  where: {
    machineId: targetMachineId,
    id: { not: currentAssignmentId }, // LOẠI TRỪ CHÍNH RECORD ĐANG SỬA
    startDate: { lte: targetEndDate },
    endDate: { gte: targetStartDate },
  },
})
```
- Nếu phát hiện trùng với assignment khác $\rightarrow$ Báo HTTP 409: `"Máy đã được xếp lịch trong khoảng thời gian này"`.

### 2.2 Cập nhật UI `DetailModal.tsx`
- Khi bấm vào 1 ô lịch đã gán trên Grid $\rightarrow$ Mở `DetailModal`.
- Nút **"Edit" (Sửa)** cho phép chuyển modal sang chế độ chỉnh sửa.
- Trình bày form sửa gồm:
  1. **Máy dệt (Machine)**: Dropdown chọn danh sách máy (pre-fill máy hiện tại).
  2. **Đơn hàng (Order)**: Dropdown chọn đơn hàng (pre-fill đơn hiện tại, cho phép đổi sang đơn chưa gán khác).
  3. **Ngày bắt đầu (Start Date)**: `input type="date"` (pre-fill ngày bắt đầu hiện tại).
  4. **Ngày kết thúc (End Date)**: `input type="date"` (pre-fill ngày kết thúc hiện tại).
- Bấm **"Save" (Lưu)** $\rightarrow$ Gọi `PATCH /api/assignments/[id]` $\rightarrow$ Re-fetch lại dữ liệu lịch mà không làm mất trạng thái view.

---

## 3. Phần 2: Tô Màu Theo PI Number (PI-Based Color Coding)

### 3.1 Bảng Palette Màu Đề Xuất (~16 màu chuẩn UI/UX)
Mỗi màu trong palette bao gồm màu nền (`bg`), màu chữ (`text`), và màu border nhẹ (`border`) đảm bảo tương phản cao (contrast ratio >= 4.5:1), không gây chói mắt.

```ts
export type ColorStyle = {
  bg: string
  text: string
  border: string
}

export const PI_COLOR_PALETTE: ColorStyle[] = [
  { bg: 'bg-emerald-100 dark:bg-emerald-950', text: 'text-emerald-900 dark:text-emerald-200', border: 'border-emerald-300 dark:border-emerald-800' },
  { bg: 'bg-blue-100 dark:bg-blue-950', text: 'text-blue-900 dark:text-blue-200', border: 'border-blue-300 dark:border-blue-800' },
  { bg: 'bg-purple-100 dark:bg-purple-950', text: 'text-purple-900 dark:text-purple-200', border: 'border-purple-300 dark:border-purple-800' },
  { bg: 'bg-amber-100 dark:bg-amber-950', text: 'text-amber-950 dark:text-amber-200', border: 'border-amber-300 dark:border-amber-800' },
  { bg: 'bg-rose-100 dark:bg-rose-950', text: 'text-rose-900 dark:text-rose-200', border: 'border-rose-300 dark:border-rose-800' },
  { bg: 'bg-indigo-100 dark:bg-indigo-950', text: 'text-indigo-900 dark:text-indigo-200', border: 'border-indigo-300 dark:border-indigo-800' },
  { bg: 'bg-teal-100 dark:bg-teal-950', text: 'text-teal-900 dark:text-teal-200', border: 'border-teal-300 dark:border-teal-800' },
  { bg: 'bg-cyan-100 dark:bg-cyan-950', text: 'text-cyan-900 dark:text-cyan-200', border: 'border-cyan-300 dark:border-cyan-800' },
  { bg: 'bg-sky-100 dark:bg-sky-950', text: 'text-sky-900 dark:text-sky-200', border: 'border-sky-300 dark:border-sky-800' },
  { bg: 'bg-violet-100 dark:bg-violet-950', text: 'text-violet-900 dark:text-violet-200', border: 'border-violet-300 dark:border-violet-800' },
  { bg: 'bg-fuchsia-100 dark:bg-fuchsia-950', text: 'text-fuchsia-900 dark:text-fuchsia-200', border: 'border-fuchsia-300 dark:border-fuchsia-800' },
  { bg: 'bg-pink-100 dark:bg-pink-950', text: 'text-pink-900 dark:text-pink-200', border: 'border-pink-300 dark:border-pink-800' },
  { bg: 'bg-orange-100 dark:bg-orange-950', text: 'text-orange-950 dark:text-orange-200', border: 'border-orange-300 dark:border-orange-800' },
  { bg: 'bg-lime-100 dark:bg-lime-950', text: 'text-lime-950 dark:text-lime-200', border: 'border-lime-300 dark:border-lime-800' },
  { bg: 'bg-yellow-100 dark:bg-yellow-950', text: 'text-yellow-950 dark:text-yellow-200', border: 'border-yellow-300 dark:border-yellow-800' },
  { bg: 'bg-stone-200 dark:bg-stone-800', text: 'text-stone-900 dark:text-stone-100', border: 'border-stone-400 dark:border-stone-600' },
]
```

### 3.2 Thuật Toán Hash Deterministic Cho `piNumber`
Mã màu được tính toán trực tiếp từ chuỗi `piNumber` bằng hàm hash đơn giản, ổn định:

```ts
export function getPiColorStyle(piNumber: string): ColorStyle {
  if (!piNumber) return PI_COLOR_PALETTE[0]
  
  let hash = 0
  for (let i = 0; i < piNumber.length; i++) {
    hash = piNumber.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  const index = Math.abs(hash) % PI_COLOR_PALETTE.length
  return PI_COLOR_PALETTE[index]
}
```
- **Tính chất**: Cùng một chuỗi `piNumber` (ví dụ `IWN26-161`) sẽ **LUÔN LUÔN** ra cùng một `ColorStyle` bất kể load lại trang bao nhiêu lần hay hiển thị ở máy nào.

### 3.3 Hiển Thị Kết Hợp Đơn Nháp (Sprint H2)
Giữ chỗ tạm (Sprint H2) sử dụng đường viền đứt nét overlay:
- **Đơn chính thức**: Nền theo `getPiColorStyle(piNumber).bg`, chữ `getPiColorStyle(piNumber).text`, viền liền.
- **Đơn nháp (Giữ chỗ tạm)**: Nền theo `getPiColorStyle(piNumber).bg`, chữ `getPiColorStyle(piNumber).text`, cộng thêm lớp viền **`border-2 border-dashed border-amber-600/90`** và badge `📌 [Nháp]`.
- Hai yếu tố này hiển thị độc lập, không đá nhau: Màu nền giúp nhận diện PI, viền đứt giúp nhận diện trạng thái Nháp.

---

## 4. Phân Tích Rủi Ro (Risk Analysis)

| Rủi ro | Mức độ | Giải pháp & Đánh giá |
| :--- | :--- | :--- |
| Các PI cũ đã gán trước Sprint H3 (146 record F3 backfill + lịch khác) có tự động có màu không? | **Không có rủi ro** | **TỰ ĐỘNG 100%**. Vì màu sắc không lưu vào DB field riêng mà được tính pure function `getPiColorStyle(assignment.order.piNumber)` trực tiếp khi render ô cell trên Client Component Schedule Grid. Mọi bản ghi lịch cũ hay mới đều hiển thị màu ngay sau khi deploy. |
| Đơn hàng khác nhau trùng màu hash (Color Collision) | **Thấp / Chấp nhận được** | Palette có 16 màu. Theo nguyên lý Dirichlet, cơ hội 2 PI kề nhau trên cùng 1 góc màn hình trùng màu là rất thấp. Yêu cầu đã nêu rõ: "chấp nhận trùng ngẫu nhiên nếu palette hết màu". |
| Sửa ngày của chính nó bị báo Overlap Check 409 | **Đã xử lý trong plan** | Query `findFirst` trong `PATCH /api/assignments/[id]` bổ sung `id: { not: currentId }` để loại trừ chính nó khi kiểm tra trùng. |

---

## 5. Kế Hoạch Xác Minh (Verification Plan)
1. **Automated Verification**: `npm run build` kiểm tra 0 TypeScript / Lint error.
2. **Manual Verification**:
   - Mở Schedule Grid, kiểm tra các PI Number khác nhau hiển thị màu sắc khác nhau.
   - Kiểm tra đơn nháp vừa có màu nền của PI vừa có viền đứt nét `📌 Nháp`.
   - Bấm Edit một ô lịch, đổi máy dệt hoặc sửa ngày bắt đầu/kết thúc $\rightarrow$ Lưu thành công mà không bị dính 409 với chính nó.
