# Flow kiểm thử thủ công bản local

URL: http://127.0.0.1:3000/login. Tài khoản được cấp trong chat; không lưu mật khẩu vào Git. Tài khoản này chỉ dùng DB local, mọi user có cùng quyền theo scope hiện tại.

| Bước | Thao tác / input | Kết quả mong đợi |
|---|---|---|
| 1 | Cửa sổ ẩn danh mở /orders hoặc /reports | Chuyển sang /login |
| 2 | Nhập email test và sai mật khẩu một lần | Báo lỗi, vẫn ở login. Không thử sai 5 lần liên tiếp nếu muốn tiếp tục ngay: tài khoản sẽ khóa 15 phút. |
| 3 | Nhập đúng tài khoản được cấp | Chuyển Production Orders, thấy nút Đăng xuất |
| 4 | Vào Customers và tạo khách “Khách test local”; New order tạo PI TEST-LOCAL-001, đơn theo mét, khổ 2m, chiều dài 100m, GSM 100, màu BLACK, GSM sản xuất trống | Lưu và mở lại đúng dữ liệu. Diện tích 200m², trọng lượng 20kg; nhu cầu sợi 21kg nếu đủ điều kiện tính theo công thức hiện có. |
| 5 | Vào Schedule, chọn máy/ngày trống và xếp item TEST-LOCAL-001; mở lại lịch | Có lịch đúng item. Thử một lịch khác chồng lên cùng máy/khoảng ngày phải báo xung đột. |
| 6 | Mở menu Báo cáo thống kê, chuyển HDPE/Extruder/Warping/Knitting/Rolling | Tải đúng bảng; khi chưa nhập dữ liệu hiển thị trạng thái rỗng. Rolling có phần Đóng gói. |
| 7 | Tải mẫu Excel từ công đoạn cần thử, điền theo template; upload và xem trước | Có kết quả kiểm tra từng dòng trước xác nhận. Chọn đúng kỳ; sheet đóng gói trong báo cáo tháng 10 được cấp là tháng 1, không dùng làm số thực tế tháng 10. |
| 8 | Sau khi nhập báo cáo local, vào Production Orders → Sản lượng; chọn công đoạn, tìm PI nguồn, đổi lọc liên kết, đổi số dòng/trang | Giá trị và PI nguồn đúng; chưa có item thì hiện “Chưa gắn item”, không tự tạo đơn. Không cộng chung kg/mét/metric Rolling. |
| 9 | Đăng xuất; mở lại trang được bảo vệ và gọi API nghiệp vụ | Trang chuyển login; API trả 401. |

Phạm vi chưa có để kiểm: nhập trực tiếp sản lượng, CRUD kế hoạch, màn gán item, quy cách/ảnh mới, mẫu in SNY khác và dashboard tổng hợp CHART mới. Các bước về đơn/lịch dùng luồng hiện có; chưa đại diện UAT cả 10 task.

Kiểm tài khoản đã cấp: đăng nhập HTTP local, mở Reports/Sản lượng/API, đăng xuất và kiểm phiên bị thu hồi đã PASS. Phiên test đã thu hồi; tài khoản vẫn tồn tại để người dùng đăng nhập.
