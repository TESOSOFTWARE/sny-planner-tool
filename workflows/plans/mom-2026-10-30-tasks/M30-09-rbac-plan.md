# M30-09 — Kế hoạch bổ sung phân quyền

Trạng thái: **ĐỀ XUẤT CHỜ SNY/TESO DUYỆT MA TRẬN**. Hiện hệ thống chỉ xác thực email/mật khẩu; user đăng nhập có cùng quyền.

## Mục tiêu

- Giữ email/mật khẩu và session hiện có.
- Kiểm tra quyền phía server ở trang, Route Handler và Server Action. Ẩn nút chỉ là hiển thị.
- Mặc định từ chối nếu route/action chưa có rule.
- Không suy role/ownership từ Excel, mã PI hoặc dữ liệu browser.

## Input cần chốt

1. Nhóm người dùng thật; ai cấp, khóa và reset tài khoản.
2. Xác nhận hoặc sửa ma trận quyền dưới đây.
3. Một account có thể có nhiều role không.
4. Ai được xóa dữ liệu và xác nhận nhập lại báo cáo.
5. Cách reset mật khẩu, thời hạn phiên và thu hồi phiên khi khóa user.
6. Người nhận account admin bootstrap và kênh bàn giao mật khẩu.
7. Chốt ai có quyền tạo role (đề xuất: Admin), account có thể mang nhiều role không và role đang được dùng xử lý ra sao khi cần xóa/sửa.

## Hai bảng quản trị và luồng thao tác

Trong Settings có hai tab riêng:

1. **Vai trò & quyền:** Admin tự tạo/sửa tên role và tick quyền theo module/hành động.
2. **Tài khoản:** Admin tạo account bằng email, đặt mật khẩu ban đầu, gán một hoặc nhiều role, khóa/mở account và thu hồi session.

Flow:

`Admin tạo role → chọn quyền → lưu role → tạo account → gán role → user đăng nhập → server nạp quyền của user → cho phép hoặc từ chối từng thao tác`.

Đề xuất account có thể nhận nhiều role; quyền hiệu lực là hợp của các permission được gán. Role bị xóa phải chặn nếu còn account đang dùng, hoặc Admin cần chuyển account sang role khác trước. Đổi quyền có hiệu lực ở request tiếp theo; session không lưu bản quyền cũ.

## Ma trận permission đề xuất

Role do Admin tự đặt tên. Permission là danh mục hệ thống cố định để role chọn, không cho người dùng tự tạo chuỗi permission tùy ý.

| Resource | Permission |
|---|---|
| Production Orders | `orders.read`, `orders.create`, `orders.update`, `orders.approve`, `orders.delete`, `orders.import` |
| Schedule | `schedule.read`, `schedule.assign`, `schedule.update`, `schedule.remove`, `schedule.import`, `schedule.calendar.manage` |
| Sản lượng | `output.read`, `output.plan.create`, `output.plan.update`, `output.actual.import`, `output.actual.enter`, `output.link.resolve`, `output.print` |
| Materials | `materials.read`, `materials.stock.update`, `materials.transaction.manage`, `materials.import.confirm` |
| Reports | `reports.read`, `reports.print` |
| Tài khoản và role | `access.users.manage`, `access.roles.manage` |

`delete`, `approve`, `import.confirm`, `link.resolve` và `access.*` là quyền nhạy cảm; mặc định không gán cho role mới. Cần SNY xác nhận danh mục action cuối và có cần tách xác nhận preview/confirm.

## Input → các bước → output

| Bước | Input | Làm gì | Output |
|---|---|---|---|
| RBAC-1: catalog | 71 API route, page và server action | Lập inventory resource/action, kể cả GET có dữ liệu nhạy cảm và mọi mutation | Danh mục permission cố định, truy được permission tới endpoint/action |
| RBAC-2: thiết kế dữ liệu | Catalog đã rà | Thêm `Role`, `Permission`, `RolePermission`, `UserRole`; giữ bảng `SnyUser/SnySession` | Quan hệ account–role–permission, role có thể cấp nhiều account |
| RBAC-3: Settings UI | Model và luồng được duyệt | Tab Vai trò & quyền để tạo/sửa role, tab Tài khoản để tạo/khóa/gán role | Admin thao tác theo đúng flow người dùng mô tả |
| RBAC-4: policy server | Catalog và DB relation | Viết `requirePermission(resource, action)`; quyền lấy từ DB, mặc định deny; kiểm soát mọi API/action | UI và gọi API trực tiếp có cùng kết quả quyền |
| RBAC-5: chuyển đổi | Account login hiện có | Dry-run preview role cho từng account; Admin đầu tiên bootstrap an toàn; không tự cấp quyền cao nhất cho toàn bộ user | Danh sách mapping được duyệt, account không bị khóa nhầm |
| RBAC-6: bảo trì | Role/account | Xóa role đang được dùng bị chặn; khóa account thu hồi session; sửa role có hiệu lực ở request kế tiếp | Vòng đời role/account rõ, không có quyền mồ côi |
| RBAC-7: kiểm thử/UAT | Tài khoản test của từng role | Test allow/deny trên page/API/action, IDOR, khóa user, đổi permission và import confirm | Ma trận kiểm chứng và bằng chứng UAT |

Acceptance permission matrix và user lifecycle cần được chốt trước bước RBAC-2; các thao tác schema/auth thuộc high-risk, migration chỉ áp DB local/staging được xác minh.

## Các bước Input → Output

| Bước | Input | Làm gì | Output |
|---|---|---|---|
| RBAC-1 | 71 API route, pages, actions | Liệt kê route × method × read/write × quyền | Inventory đủ endpoint |
| RBAC-2 | Inventory và bảng quyền | SNY/TESO chốt role, xóa/confirm, vòng đời account | Ma trận được duyệt |
| RBAC-3 | Ma trận duyệt, schema | Thêm Role/relation; SQL additive + rollback; preview mapping account cũ | Migration không gán admin ngầm |
| RBAC-4 | Role/schema | Tạo policy helper requirePermission(resource, action), default deny | Helper server và test allow/deny |
| RBAC-5 | Inventory endpoint | Bảo vệ API/actions theo method; kiểm CSRF, IDOR; không nhận role từ client | Coverage 100%, direct API không vượt quyền |
| RBAC-6 | Quy tắc account | Admin quản lý user, gán role, khóa, thu hồi phiên và reset theo chính sách | UI quản trị; không thể khóa admin cuối |
| RBAC-7 | User test và staging | Test quyền, import confirm, đổi role, revoke session, rollback | Evidence UAT và checklist phát hành |

## File dự kiến

- prisma/schema.prisma, migration SQL additive và rollback.
- src/lib/auth/permissions.ts và cập nhật helper/session.
- Các src/app/api/**/route.ts và src/app/**/actions.ts nghiệp vụ.
- SideNav/TopNav, trang quản lý user và API tương ứng.
- Unit/policy test và integration test trên local/staging.

## Migration và rollout

1. Xác nhận DB local/staging bằng host/database; backup đích được duyệt.
2. Thêm schema additive. Không tự nâng quyền account cũ trong migration.
3. Preview account → role; người có thẩm quyền duyệt mapping trước khi ghi.
4. Triển khai schema rồi code. Endpoint chưa khai báo policy bị từ chối.
5. Tạo account Admin bootstrap một lần, nhập mật khẩu ẩn; không ghi mật khẩu vào repo.
6. Tạo và kiểm tra ít nhất hai account Admin để tránh mất đường quản trị.
7. Bật enforcement đầy đủ khi coverage xong.
8. Rollback code trước và giữ bảng role/user/session. Drop schema cần migration riêng vì mất role assignment.

## Acceptance

- Mọi page, API method và Server Action được phân quyền rõ.
- Chưa đăng nhập nhận 401; thiếu quyền nhận 403.
- Khóa user/thu hồi phiên có hiệu lực từ request sau.
- Preview và confirm import có quyền riêng; confirm kiểm lại phía server.
- Chỉ permission access.users.manage quản lý account; chỉ access.roles.manage tạo/sửa role.
- Không thể khóa hoặc xóa account Admin cuối, cũng không xóa role còn đang được gán.
- UAT từng role trên staging; test/build đạt và rollback được diễn tập.

Ước lượng sau khi chốt ma trận và luồng: inventory 2–4 ngày; schema/session 3–4; policy và API/actions 5–8; hai tab quản trị 4–6; kiểm thử/UAT 3–5. Tổng 17–27 ngày công một full-stack dev có QA/reviewer hỗ trợ. Chưa đổi code RBAC và chưa gán role.
