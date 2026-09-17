# Sprint C: Materials 3 Tabs + Per-Tab Import

## 1. Mục tiêu
Chia trang quản lý Nguyên vật liệu (Materials) thành 3 tab: HDPE, Masterbatch (MB), Korea & Khác. Mỗi tab có cấu trúc cột riêng, import riêng, template riêng để phù hợp với quy trình kho.

## 2. Các thay đổi dự kiến

### 2.1. Database Schema
- Cần thêm cột `group` (NHÓM) vào bảng `Material` (vì hiện tại em check schema **chưa có cột này**).
- `MaterialTransaction` giữ nguyên (các `txType` hiện có đã đủ).

### 2.2. UI/UX: Trang `/materials`
- Sử dụng Tabs component cho 3 nhóm.
- **Tab HDPE**: Cột `Tên NVL | Tồn đầu | Nhập (IN) | HDPE Broken | Xuất Tape | Reject | Xuất (OUT USING) | Tồn cuối`.
- **Tab MB**: Cột `Màu | Tên NVL | Hãng | Tồn đầu | Nhập (IN) | Xuất Tape | Xuất (OUT) | Tồn cuối`. UI có thanh search nổi bật "Tìm mã màu, tên màu...".
- **Tab Korea & Khác**: Cột `Tên NVL | Tồn đầu | Nhập (IN) | Xuất (OUT) | Tồn cuối`.
- Phần Summary tổng số / cảnh báo sẽ tách riêng cho mỗi Tab.
- Panel chi tiết NVL (slide-in) giữ nguyên.

### 2.3. Modal Import & Template
- Tách `ImportMaterialReportModal.tsx` thành 3 Modal riêng biệt.
- 3 API tải Template riêng tương ứng với số cột thực tế. Template MB sẽ có tên NVL/Màu để user điền.

---

> [!WARNING]
> ## 3. STOP CONDITIONS — Cần anh confirm trước khi Build
> 
> 1. **Field `NHÓM` chưa có trong DB**: Schema hiện tại của `Material` chưa có field nào để phân loại. 
>    *My recommendation: Em sẽ thêm cột `group String @default("KOREA")` (hoặc Enum) vào bảng `Material` trước.*
> 2. **Cách parse Template MB ("MOL2008 ORANGE ARIRANG")**: 
>    *Nếu dùng code để tách tự động thì rất dễ sai sót (vd "LIGHT BLUE"). My recommendation: Trong bảng MB ta chỉ hiển thị Tên NVL y hệt gốc, HOẶC lúc thêm NVL mới ta cho phép nhập tường minh trường `color` và `brand`. Việc parse tự động từ chuỗi text tự do sẽ không chính xác 100%.*
> 3. **Slide-in panel nhận `materialId`**: Em đã check, panel dùng state local và nhận toàn bộ object `Material` (kèm ID). Nó có thể tiếp tục hoạt động độc lập không bị ảnh hưởng bởi tab.

Anh Tung confirm giúp em cách giải quyết field `NHÓM` và cách tách Màu/Hãng của MB để em tiến hành Phase B nhé.
