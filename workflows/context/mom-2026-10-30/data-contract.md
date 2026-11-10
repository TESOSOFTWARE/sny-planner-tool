# M30-03 — Hợp đồng dữ liệu đề xuất khi chưa có ORDER LIST mới

Nguồn: MoM 30/10 §4; trả lời người dùng ngày 09/11: chưa có ORDER LIST hiện hành, cần phương án phù hợp; bản in cần mẫu SNY khác.

## Quy tắc đã triển khai

- Sản lượng thực tế tiếp tục nằm trong các model công đoạn hiện có. API `GET /api/production-records` chỉ đọc có phân trang, lọc công đoạn, mã `orderRef` và trạng thái có/không `orderId`.
- Giữ nguyên `orderRef` nguồn ngay cả khi chưa có đơn; không tự sinh ProductionOrder hoặc chọn item đầu PI. Giao diện hiển thị rõ “Chưa gắn item”.
- Không cộng chung kg/mét/quantity. Rolling hiển thị nhãn và giá trị metric nguồn; không tự giải nghĩa SMALL/BIG. Packing hiện là số toàn xưởng theo ngày, chưa được đưa vào bảng theo PI.
- Mọi user đăng nhập có cùng quyền trong phạm vi hiện tại theo yêu cầu người dùng. Mọi API nghiệp vụ kiểm phiên server; không dùng cookie có hình thức hợp lệ làm bằng chứng đã đăng nhập.

## Kế hoạch và nhập tay — đã thêm code local, chờ migration

| Dữ liệu | Khóa / hành vi đề xuất | Lý do |
|---|---|---|
| Kế hoạch theo công đoạn | `ProductionOutputPlan`: ngày, công đoạn, máy/ca, PI nguồn, item tùy chọn, màu, chỉ tiêu, số lượng, đơn vị, ghi chú và revision | Có thể lập kế hoạch khi thiếu catalog đơn; không tự quy đổi giá trị hoặc đơn vị |
| Sản lượng nhập tay | `ManualProductionEntry`: actual tách khỏi bảng import từng công đoạn; lưu nguồn PI thô và item nullable | Không nhập trùng vào số liệu import hoặc cộng các đơn vị khác nhau |
| Nhập lại cùng nguồn | Xem trước diff, có ảnh chụp state; chỉ thay phạm vi người dùng xác nhận | Bảo vệ liên kết item và số người dùng nhập trực tiếp |
| Nhập tay gặp bản import cùng phạm vi | Hiện xung đột để đối soát, không âm thầm cộng hoặc ghi đè | Chưa có quy tắc từ khách xác nhận hai nguồn có phải cùng sản lượng |
| Gắn item sau này | Tìm ứng viên theo PI; người dùng chọn item tường minh khi mơ hồ; lưu người/thời điểm/nguồn quyết định | Cần truy vết mà không sửa quy cách của đơn |
| Sửa chỉ dẫn đơn | Revision mới; snapshot đã dùng cho lệnh/bản in được giữ | Không làm đổi lệnh xưởng cũ theo sửa danh mục |

Kế hoạch và nhập tay có API, validation và tab riêng tại `/orders/production`; dropdown máy/PI/màu/chỉ tiêu/đơn vị lấy từ dữ liệu hiện có và có lựa chọn nhập giá trị mới. Chọn PI chỉ liệt kê item khi mã khớp chính xác. Item không được chọn thì `orderId` vẫn null và UI hiện “chưa gắn item”. Kế hoạch dùng `updatedAt` làm optimistic concurrency token, tăng revision và lưu payload revision cũ trong bảng lịch sử khi sửa. Migration SQL đã áp dụng trên PostgreSQL local.

Actual Excel theo từng công đoạn tiếp tục dùng preview/confirm hiện hữu tại menu Reports; bảng Production Orders có liên kết sang khu vực import. Chưa có import workbook chung cho kế hoạch mới; các định dạng kế hoạch nguồn có cấu trúc khác nhau và chưa được gom thành một contract.

Thiếu catalog mới không chặn lưu tham chiếu nguồn, nhưng chặn khẳng định tiến độ chính xác theo item. M30-06/07 vẫn cần mẫu in khác của SNY; không nghiệm thu bằng mẫu hiện tại.
