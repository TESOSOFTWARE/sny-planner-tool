# M30-10 — Kết quả kiểm tra và phần chưa nghiệm thu

Ngày 09/11/2026. Chỉ DB local `127.0.0.1:55432/sny_planner_local`; không nhập hoặc sửa dữ liệu khách.

| Case | Input / thao tác | Kỳ vọng | Bằng chứng / kết quả |
|---|---|---|---|
| AUTH-01 | GET API nghiệp vụ không cookie hoặc cookie hỏng | 401, không trả dữ liệu | Unit + HTTP local: PASS |
| AUTH-02 | Mở /orders chưa login | Chuyển /login | HTTP local: PASS; server page đã bổ sung guard trước truy vấn |
| AUTH-03 | Sai mật khẩu; đúng mật khẩu của user test | Sai: 401; đúng: session HttpOnly | HTTP local + browser: PASS |
| AUTH-04 | Mutation có phiên từ Origin khác | 403 trước mutation nghiệp vụ | HTTP local: PASS |
| AUTH-05 | Logout rồi dùng cookie cũ | Cookie cũ không dùng lại được | HTTP local + browser logout: PASS |
| AUTH-06 | Sai 5 lần rồi nhập đúng trong thời gian khóa | Tạm khóa 15 phút lưu DB | HTTP local: PASS |
| AUTH-07 | Phiên hết hạn | 401 | Fixture unit: PASS |
| OUTPUT-01 | 4 công đoạn, raw PI chưa có item | Giữ raw PI và orderId null; không tự đoán item | Fixture unit: PASS |
| OUTPUT-02 | Lọc PI, linked/unlinked, phân trang và limit sai | Where đúng; limit sai 422; tùy chọn pager 200 hợp lệ | Fixture unit: PASS |
| UI-01 | Login → Reports → Sản lượng → Logout | Đến đúng màn, trạng thái tải/rỗng rõ | Browser local: PASS; Reports 1280px, sản lượng 768px; DB rỗng |
| IMPORT-01 | File khách → preview → confirm → DB → UI | Chi tiết/tổng khớp từng chiều | NOT_RUN cho chức năng mới; chưa có nhập tay/kế hoạch mới |
| ORDERS-01 | Đối chiếu chỉ dẫn qua tất cả template | Field/revision/ảnh đầy đủ | PARTIAL: cấu trúc 591 sheet và 117 header đại diện; không coi là đối soát mọi ô |
| PRINT-01 | Kế hoạch kéo sợi in ngày theo mẫu mới | Khớp mẫu xưởng | WAITING_SOURCE: người dùng yêu cầu mẫu SNY khác, chưa cung cấp |
| PRINT-02 | Lịch dệt in tuần/tháng theo mẫu mới | Đúng kỳ/máy/ngày nghỉ | WAITING_SOURCE: chưa có mẫu SNY |
| CUSTOMER-UAT | Planner dùng một PI thật xuyên công đoạn | SNY xác nhận đủ dùng | NOT_RUN; cần buổi nghiệm thu khách |

Không suy kết quả fixture thành số liệu production đúng hoặc UAT đã đạt. Bộ unit/business-test và build được ghi trong local-login.md; người dùng tạo tài khoản thật bằng CLI, không sử dụng tài khoản test vì chúng đã bị dọn.
