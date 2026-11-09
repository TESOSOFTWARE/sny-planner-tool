# M30-03 — Hợp đồng dữ liệu đề xuất khi chưa có ORDER LIST mới

Nguồn: MoM 30/10 §4; trả lời người dùng ngày 09/11: chưa có ORDER LIST hiện hành, cần phương án phù hợp; bản in cần mẫu SNY khác.

## Quy tắc đã triển khai

- Sản lượng thực tế tiếp tục nằm trong các model công đoạn hiện có. API `GET /api/production-records` chỉ đọc có phân trang, lọc công đoạn, mã `orderRef` và trạng thái có/không `orderId`.
- Giữ nguyên `orderRef` nguồn ngay cả khi chưa có đơn; không tự sinh ProductionOrder hoặc chọn item đầu PI. Giao diện hiển thị rõ “Chưa gắn item”.
- Không cộng chung kg/mét/quantity. Rolling hiển thị nhãn và giá trị metric nguồn; không tự giải nghĩa SMALL/BIG. Packing hiện là số toàn xưởng theo ngày, chưa được đưa vào bảng theo PI.
- Mọi user đăng nhập có cùng quyền trong phạm vi hiện tại theo yêu cầu người dùng. Mọi API nghiệp vụ kiểm phiên server; không dùng cookie có hình thức hợp lệ làm bằng chứng đã đăng nhập.

## Quy tắc đề xuất cho nhập tay và kế hoạch — chưa triển khai

| Dữ liệu | Khóa / hành vi đề xuất | Lý do |
|---|---|---|
| Kế hoạch kéo sợi | Một dòng có mã nguồn, máy, ngày, cấu phần/màu và revision; `orderId` nullable | Có thể lập kế hoạch khi thiếu catalog đơn, nhiều cấu phần có thể phục vụ cùng PI |
| Nội dung kế hoạch dạng chữ | Lưu raw text cùng file/sheet/ô; chỉ tách lượng khi đơn vị được xác nhận | Ô “800+800 (2 dàn...)” chưa phải trường kg đã được xác nhận |
| Nhập lại cùng nguồn | Xem trước diff, có ảnh chụp state; chỉ thay phạm vi người dùng xác nhận | Bảo vệ liên kết item và số người dùng nhập trực tiếp |
| Nhập tay gặp bản import cùng phạm vi | Hiện xung đột để đối soát, không âm thầm cộng hoặc ghi đè | Chưa có quy tắc từ khách xác nhận hai nguồn có phải cùng sản lượng |
| Gắn item sau này | Tìm ứng viên theo PI; người dùng chọn item tường minh khi mơ hồ; lưu người/thời điểm/nguồn quyết định | Cần truy vết mà không sửa quy cách của đơn |
| Sửa chỉ dẫn đơn | Revision mới; snapshot đã dùng cho lệnh/bản in được giữ | Không làm đổi lệnh xưởng cũ theo sửa danh mục |

Thiếu catalog mới không chặn lưu tham chiếu nguồn, nhưng chặn khẳng định tiến độ chính xác theo item. Các output hiện đã đọc độc lập ở M30-05; chưa có luồng tạo/sửa kế hoạch, nhập tay, hoặc màn gán item. M30-06/07 cần mẫu in khác của SNY, chưa được nghiệm thu bằng mẫu hiện tại.
