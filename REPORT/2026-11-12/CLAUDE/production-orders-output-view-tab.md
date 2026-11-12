# Task card — Đưa Sản lượng vào thanh trạng thái Production Orders

**Ref:** [MoM 30/10 §2] — tab sản lượng trong Production Orders; tinh chỉnh vị trí theo yêu cầu người dùng ngày 12/11/2026.  
**Tier:** Normal · **Output:** UI code · **Data:** không đọc/ghi DB, không migration.
**Status:** Inline view local đã triển khai; typecheck/build PASS; browser QA theo role/viewport chưa chạy.

## Goal

Đưa **Sản lượng** lên cùng hàng với các trạng thái **Tất cả / Chưa lên lịch / Đã lên lịch / Đang sản xuất / Hoàn thành** và khi bấm thì thay nội dung ngay trong khung Production Orders, không điều hướng sang route mới.

## Hiện trạng đã kiểm

- `src/app/orders/page.tsx:107-108` đặt link Sản lượng trong nhóm thao tác phía trên.
- `src/components/orders/OrderTable.tsx:179-204` render hàng lọc trạng thái; hàng đã có `overflow-x-auto`.
- `src/app/orders/production/page.tsx` chứa route trực tiếp hiện tại; workspace đã được tách thành `src/components/orders/ProductionRecordsWorkspace.tsx` để dùng lại inline.
- `src/lib/auth/permissions.ts:11` khai báo `/orders/production` cần `output.read`; `src/app/layout.tsx:51-58` chặn truy cập trang không có quyền.

## Quyết định

- Thêm tab **Sản lượng** ở cuối hàng trạng thái; đây là chế độ xem trong cùng `/orders`, không phải bộ lọc đơn và không đổi URL.
- Chỉ render tab nếu tài khoản có `output.read`; direct route `/orders/production` vẫn giữ guard hiện có.
- Tách nội dung production hiện có thành `ProductionRecordsWorkspace`, dùng lại trong route trực tiếp và nhúng trong OrderTable. Khi tab Sản lượng được chọn, ẩn search/table đơn và hiện toàn bộ nội dung sản lượng trong cùng content frame.
- Giữ nguyên các tab con và dữ liệu; bấm một trạng thái sẽ quay lại danh sách đơn với lọc tương ứng.
- Mobile tiếp tục dùng thanh ngang cuộn được, không làm co hoặc đổi ý nghĩa các bộ lọc hiện tại.

## Scope

- `src/app/orders/page.tsx` — kiểm tra quyền `output.read`, truyền cờ xuống OrderTable; bỏ nút Sản lượng khỏi hàng header.
- `src/components/orders/OrderTable.tsx` — thêm state view; tab Sản lượng chuyển nội dung nội bộ, giữ query/status filter.
- `src/components/orders/ProductionRecordsWorkspace.tsx` — component dùng lại với chế độ embedded để bỏ breadcrumb route khi nằm trong Orders.
- `src/app/orders/production/page.tsx` — route trực tiếp trở thành wrapper cho component dùng lại.

## Out of scope

- Thay đổi API, schema, permission catalog, các tab con trang Sản lượng hoặc luồng in.
- Thay đổi cách lọc Tất cả / Chưa lên lịch / Đã lên lịch / Đang sản xuất / Hoàn thành.

## Acceptance

1. Có `output.read`: tab Sản lượng xuất hiện sau Hoàn thành; bấm không đổi URL và thay phần content sang workspace sản lượng.
2. Không có `output.read`: tab không render; mở trực tiếp `/orders/production` vẫn bị từ chối bởi guard hiện tại.
3. Bấm một trạng thái trong lúc đang xem Sản lượng quay lại danh sách và áp dụng lọc đó; các trạng thái vẫn cập nhật query như trước.
4. Ở viewport desktop và mobile, hàng tab giữ được nhãn và cuộn ngang khi thiếu chỗ; không tràn vào bảng.
5. Tab con Sản lượng từ báo cáo / Nhập trực tiếp / Kế hoạch hoạt động cả ở inline mode và route trực tiếp.

## Verify

- `npm run typecheck`
- `git diff --check`
- Browser: thử role có và không có `output.read`; kiểm tra inline switch và màn hình ở 1280px và 768px.

## Rollback

Revert các file trong Scope. Không có thay đổi DB.

## Stop condition

Nếu link Sản lượng cần hiện cho account chỉ có `orders.read` hoặc quyền khác `output.read`, chốt lại ma trận quyền trước khi triển khai; mặc định hiện tại là `output.read`.
