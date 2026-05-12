# SNY Planner — Danh sách công việc

> **Cập nhật lần cuối:** 04/05/2026  
> **Trạng thái hiện tại:** Phase 0 (Demo) hoàn thành — sẵn sàng trình bày khách hàng

---

## ✅ ĐÃ LÀM — Phase 0: Demo bán hàng

### Hạ tầng & cấu hình
- [x] Khởi tạo dự án Next.js 16 + TypeScript + Tailwind CSS v4
- [x] Cài đặt và cấu hình shadcn/ui v4 (base-ui)
- [x] Cài đặt Vitest cho unit test
- [x] Cấu hình alias `@/*` trong tsconfig + vitest.config.ts
- [x] `npm run dev` chạy sạch, không lỗi console
- [x] `npm run build` pass — 0 TypeScript error
- [x] `npm run test:run` — 6/6 tests pass

### Types & Data (không có database)
- [x] `types/index.ts` — toàn bộ TypeScript interfaces
- [x] `data/orders.ts` — 8 đơn hàng seed với mã thực tế
- [x] `data/machines.ts` — 12 máy dệt với khổ rộng thực tế
- [x] `data/inventory.ts` — 10 loại masterbatch từ CC2018
- [x] `data/schedule.ts` — 3 phiên bản lịch tháng 1/2026
- [x] `data/specs.ts` — 4 chuỗi spec thực tế để test
- [x] `data/warping_template.ts` — hàm sinh 18 beam warping

### Thư viện core
- [x] `lib/parseSpec.ts` — pure function parser, xử lý 4 định dạng spec
- [x] `lib/parseSpec.test.ts` — 6 test case Vitest (tất cả pass)
- [x] `lib/formatters.ts` — `toVN()`, `toVNDate()` (định dạng số/ngày VN)
- [x] `lib/orderContext.tsx` — React Context + useReducer quản lý state đơn hàng

### Layout
- [x] `app/layout.tsx` — Root layout với Sidebar, OrderProvider, TooltipProvider
- [x] `components/layout/Sidebar.tsx` — sidebar cố định, 3 nav items, logo SNY
- [x] `components/layout/Topbar.tsx` — tiêu đề trang + avatar người dùng fake

### Screen 1 — Lệnh sản xuất (/orders)
- [x] Trang danh sách: bảng 8 đơn hàng, badge trạng thái màu sắc
- [x] Nút "+ Tạo đơn mới" mở modal
- [x] Modal tạo đơn: input tên khách, textarea spec, date picker
- [x] Live parse badges: hiển thị trường đã parse ngay khi gõ spec
- [x] Thêm đơn mới vào in-memory state, navigate tới trang chi tiết
- [x] Trang chi tiết /orders/[id] — header card + 3 tabs
- [x] Tab "Tổng quan": spec đã parse + kế hoạch mét + ước tính kg
- [x] Tab "Phiếu warping": bảng 18 beam, nhãn TRƯỚC/GIỮA/SAU
- [x] Tab "Nhu cầu nguyên liệu": bảng top 5 NL + highlight đỏ khi thiếu

### Screen 2 — Lịch máy dệt (/schedule)
- [x] Grid 12 máy x 31 ngày tháng 1/2026
- [x] Cột trái cố định: tên máy + khổ rộng
- [x] Cells màu theo loại vải (5 màu: emerald/violet/sky/orange/lime)
- [x] Continuation bar cho các ngày giữa span
- [x] Tooltip hover hiển thị full spec
- [x] Dropdown chọn phiên bản (5.1 / 3.1 / 2.1) — đổi data live
- [x] Chú thích màu (legend) ở đầu grid
- [x] Button "Phát hành phiên bản mới" mở modal placeholder

### Screen 3 — Nguyên liệu (/materials)
- [x] Alert card amber: cảnh báo 14 ngày tới với 3 dòng cụ thể
- [x] Bảng tồn kho 10 mặt hàng
- [x] Highlight đỏ hàng thiếu (stock < committed)
- [x] Tính cột "Còn lại" và "Cần đặt"
- [x] Button "Xem chi tiết" và "Xuất đề xuất mua hàng" (placeholder)

### Tài liệu
- [x] `implement.md` — toàn bộ codebase cho AI đọc hiểu
- [x] `task.md` — danh sách việc đã và chưa làm (file này)

---

## ❌ CHƯA LÀM — Phase 1: MVP thực sự

> Cần sau khi khách hàng xác nhận mua. Ước tính 6-8 tuần.

### Backend & Database
- [ ] Chọn và cài đặt database (PostgreSQL đề xuất)
- [ ] ORM: Prisma hoặc Drizzle
- [ ] API routes Next.js hoặc tách backend riêng
- [ ] Migration scripts và seed production data
- [ ] Môi trường dev / staging / production

### Authentication & Authorization
- [ ] Hệ thống đăng nhập (NextAuth hoặc Clerk)
- [ ] Phân quyền theo vai trò: Kế hoạch SX / Xưởng trưởng / Giám đốc
- [ ] Session management
- [ ] Audit log: ai sửa gì lúc mấy giờ

### Screen 1 — Lệnh sản xuất (nâng cấp)
- [ ] Lưu đơn hàng vào database thực
- [ ] Sửa / xóa đơn hàng
- [ ] Đính kèm file (PDF, Excel gốc)
- [ ] Lịch sử thay đổi trạng thái đơn
- [ ] Tìm kiếm và lọc đơn theo trạng thái / khách / ngày
- [ ] Phân trang (pagination)
- [ ] Export danh sách đơn ra Excel
- [ ] Workflow duyệt đơn: Chờ duyệt → Đã duyệt → Đang SX → Hoàn thành
- [ ] Thông báo khi đơn chuyển trạng thái

### Screen 1 — Phiếu warping (nâng cấp)
- [ ] Cho phép chỉnh sửa trực tiếp trên bảng warping
- [ ] Lưu phiếu warping vào database
- [ ] In phiếu warping ra PDF
- [ ] Template warping khác nhau theo từng loại vải
- [ ] Tính toán tự động weight dựa trên thông số thực tế

### Screen 2 — Lịch máy (nâng cấp)
- [ ] Drag-and-drop lên lịch máy
- [ ] Phát hành phiên bản mới thực sự (lưu snapshot vào DB)
- [ ] So sánh 2 phiên bản side-by-side
- [ ] Phát hiện xung đột lịch tự động
- [ ] Hiển thị tháng 2, 3 (không chỉ tháng 1)
- [ ] Lọc theo loại máy hoặc khổ rộng
- [ ] Export lịch ra Excel (giống file Excel cũ)
- [ ] In lịch ra A3/A4

### Screen 3 — Nguyên liệu (nâng cấp)
- [ ] Tính toán nhu cầu NL tự động từ đơn hàng thực tế
- [ ] Nhập tồn kho thực tế (form nhập hoặc import Excel)
- [ ] Lịch sử nhập/xuất kho
- [ ] Đề xuất mua hàng thành file Excel / email
- [ ] Tích hợp với nhà cung cấp (giá, lead time)
- [ ] Cảnh báo tự động qua Zalo / Email khi sắp thiếu

---

## ❌ CHƯA LÀM — Phase 2: Tính năng mở rộng

- [ ] Dashboard tổng quan: tiến độ SX, OEE máy
- [ ] Báo cáo năng suất: mét vải/ngày/máy, kế hoạch vs thực tế
- [ ] Quản lý khách hàng: CRM đơn giản
- [ ] Quản lý nhà cung cấp: danh sách, giá, lead time
- [ ] Module QC: nhập kết quả kiểm tra chất lượng theo lô
- [ ] App mobile: xem lịch + cảnh báo NL
- [ ] Deploy cloud (Vercel + PostgreSQL)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Backup tự động + monitoring

---

## 🔧 Nợ kỹ thuật hiện tại (cần fix trước Phase 1)

- [ ] **Navigation sau tạo đơn**: dùng `setTimeout(50ms)` tạm thời — cần refactor dùng callback để lấy ID ngay
- [ ] **AlertCard**: nội dung hardcoded — cần tính động từ data thực
- [ ] **Tab Materials**: công thức tính nhu cầu (`meters * 0.0003`) là giả — cần công thức từ kỹ thuật viên
- [ ] **Warping beams**: template generic — cần config riêng per-fabric-type
- [ ] **Schedule revision 2, 3**: data ít — nên fill thêm để demo thuyết phục hơn

---

## 📋 Thứ tự ưu tiên đề xuất cho Phase 1

| Ưu tiên | Hạng mục | Lý do |
|---------|----------|-------|
| P0 | Database + Auth | Nền tảng, không có thì không làm được gì |
| P0 | Lưu đơn hàng thực | Tính năng cốt lõi nhất |
| P1 | Workflow duyệt đơn | Đội kế hoạch dùng hàng ngày |
| P1 | Lịch máy drag-drop | Xưởng trưởng dùng hàng ngày |
| P1 | Tính NL tự động từ đơn | Giảm thiếu hàng, tiết kiệm tiền |
| P2 | Export Excel / PDF | Đội vận hành quen dùng |
| P2 | Thông báo Zalo | Dễ adopt vì ai cũng dùng Zalo |
| P3 | Dashboard | Nice-to-have cho ban giám đốc |
