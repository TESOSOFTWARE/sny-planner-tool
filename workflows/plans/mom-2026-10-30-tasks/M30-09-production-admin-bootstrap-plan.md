# M30-09 — Production Admin bootstrap plan

Nguồn: MoM 30/10 §4 (đăng nhập/phân quyền); yêu cầu user ngày 10/11: tạo tài khoản Admin riêng để khách test trên production.

Trạng thái: **PLAN ĐƯỢC DUYỆT; đã tạo migration bundle và bootstrap CLI; chưa chạy production.**

## Mục tiêu

Chuẩn bị release auth/RBAC và các bảng M30 cần thiết để tạo một tài khoản Admin riêng cho khách test trên production, theo quy trình kiểm soát thay đổi hiện có.

## Hiện trạng đã xác minh

- Local có các SQL `20261109_local_login.sql`, `20261109_rbac.sql`, và `20261109_mom_production_plans_manual_entries.sql`; migration M30 cuối đã chạy ở local, không phải production.
- `scripts/bootstrap-local-admin.ts` được khóa cứng vào DB local, không dùng cho production.
- Mật khẩu ứng dụng được hash bằng scrypt ở Node. SQL thuần không thể tạo đúng password hash cho account.
- Production là DB khách đang dùng; repo yêu cầu backup, duyệt riêng mọi migration/seed production và `XAC_NHAN_GITHUB` trước GitHub write.
- Checkout hiện ở nhánh `research`, có nhiều thay đổi local chưa commit; chưa thể phát hành từ trạng thái này.

## Phương án đã chuẩn bị

1. Tạo một SQL release bundle `prisma/sql/20261110_prod_mom30_schema_and_admin_role.sql`. Bundle yêu cầu auth nền `sny_users`/`sny_sessions` và `production_orders` có sẵn; tạo RBAC + các bảng M30, seed permission catalog và system Admin role. Fail-fast nếu phát hiện bảng đích đã tồn tại/partial. Bundle không chứa email, password hay hash.
2. Tạo `scripts/bootstrap-production-admin.ts`: nhận email qua CLI, nhập password ẩn hai lần, hash bằng scrypt, tạo account mới và gán role Admin trong transaction. Chặn localhost, yêu cầu exact Neon host + database name đã xác minh, kiểm tra Admin role đã có đủ quyền, `SNY_PRODUCTION_CHANGE_APPROVED=YES` và backup reference.
3. Migration và rollback đã được chạy thử trên database local tạm có baseline tối thiểu; rollback test xác nhận giữ nguyên `production_orders`, `sny_users`, `sny_sessions`. Typecheck PASS; bootstrap CLI từ chối DB local như thiết kế.
4. Production preflight phải xác nhận các bảng nền có mặt và các bảng RBAC/M30 chưa có; không chạy cả bundle cùng ba SQL riêng `20261109_*`, không dùng `prisma db push`.
5. Sau khi chạy bundle production, bootstrap account email do user cung cấp bằng terminal tương tác và kiểm login/role. Không seed dữ liệu đơn/sản lượng TEST vào production.
6. Sau khi khách test xong, khóa account và thu hồi session qua giao diện. Rollback SQL từ chối chạy nếu đã có account/role assignment hoặc data M30.

## Rủi ro và rollback

- Tài khoản Admin có thể sửa/xóa dữ liệu khách; chỉ cấp cho email do khách/lead chỉ định và dùng mật khẩu tạm qua kênh bảo mật.
- Production không có staging riêng; browser QA bằng account này có thể đọc/ghi dữ liệu khách. Chỉ test luồng read-only trừ khi có scope ghi riêng, backup và tập dữ liệu được duyệt.
- Nếu schema/app phát sinh lỗi: rollback code trước, giữ bảng auth/RBAC. Không chạy `rollback_*.sql` tự động vì các bảng role/session/account có thể đã chứa dữ liệu cần giữ.
- Tạm dừng nếu preflight thấy schema không khớp hoặc migration đã chạy một phần.

## Điều kiện bắt đầu

1. User đã cung cấp email account Admin riêng; lead đã xác nhận duyệt migration/seed production và backup PostgreSQL 18 đã có.
2. Trước khi chạy, người vận hành còn phải xác minh production DB name/host bằng secret manager, nhập backup reference vào biến bootstrap, và kiểm tra preflight table state. Agent chưa truy cập/ghi production trong lượt này.
3. Có `XAC_NHAN_GITHUB` trước khi push/PR/merge theo quy trình repo. Migration artifacts hiện nằm local working tree, chưa commit/push.

Sau khi duyệt, tạo artifact code/migration cụ thể, review và chạy local/staging trước. Production apply vẫn là bước riêng, đúng DB và thứ tự đã được lead duyệt.
