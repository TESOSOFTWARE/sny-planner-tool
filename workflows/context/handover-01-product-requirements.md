# 01 — Sản phẩm, người dùng và yêu cầu quan trọng

## Bài toán và phạm vi

SNY VINA đang dùng các file đơn hàng, thông số beam, lịch máy và nhu cầu nguyên liệu rời nhau. Planner phải nối dữ liệu để biết cần sản xuất bao nhiêu, máy nào chạy, đã làm được bao nhiêu và còn thiếu gì. SNY Planner tập trung các thông tin này; Excel hiện vẫn là nguồn nhập thực tế.

Phase 1 tập trung nhập liệu, quản lý và theo dõi. AI xếp lịch, dự báo vật tư, chat tiếng Việt và các ý tưởng mô phỏng trong slide thuộc định hướng tiếp theo; không coi chúng là chức năng đã bàn giao hoàn chỉnh.

## Người dùng và dữ liệu chính

| Đối tượng | Vai trò nghiệp vụ |
|---|---|
| Dung, Loan | Planner; Loan còn tham gia kiểm thử nghiệp vụ theo SRS |
| Thống kê/xưởng | Cung cấp báo cáo sản lượng từng công đoạn |
| Thủ kho | Cung cấp tồn, nhập, xuất nguyên liệu |
| Ông Kim/lãnh đạo | Stakeholder theo SRS, cần thông tin để theo dõi và quyết định |
| Khách hàng SNY | Cung cấp PO và quy cách; hiện là dữ liệu được quản lý, không có bằng chứng portal khách |

Vai trò nghiệp vụ không đồng nghĩa phân quyền đã được code. Bản đọc source hiện có chưa thấy cơ chế User/Role cưỡng chế quyền Admin/Planner/Viewer.

Một PI có nhiều dòng hàng. `ProductionOrder` là một dòng, nhận diện bằng PI + sub-line; mỗi dòng có màu/khổ/GSM/số lượng/thông số riêng. Một dòng có thể chạy nhiều máy. Báo cáo công đoạn có thể chưa nối được vào dòng đơn nhưng vẫn phải giữ dấu vết nguồn. Xem [entity chi tiết](business-logic-actors-entities.md).

## Các yêu cầu khách không được bỏ sót

| Yêu cầu và nguồn | Ý nghĩa khi tiếp tục dự án |
|---|---|
| Chat: file 30 dòng chỉ nhập 20 | Phải giải trình mọi dòng: nhận, trùng, xung đột hay thiếu trường; không bỏ âm thầm vì NO trống/trùng |
| Chat: khách cũ bị báo KH MỚI | Import phải nối đúng hồ sơ khách; lưu tên text đơn thuần chưa đủ |
| Chat: Excel thiếu thông tin so với New order, gồm số kim/số dàn | Đối chiếu các trường từ nhập tay → template → parser → preview → lưu → chi tiết đơn |
| Chat: đơn nháp không thấy ô số cuộn khi muốn sửa lượng | Kiểm tra khả năng sửa qty đúng kiểu đơn và tính lại mét/diện tích/kg |
| Chat: công thức màu, mẫu DESERT SAND A/B | Cần biểu diễn nhiều thành phần theo dàn, mã màu và nhà cung cấp; một ô MB code không đủ |
| Chat: có báo cáo tồn kho riêng | Phải phân biệt báo cáo tồn với báo cáo sản lượng; đối chiếu file/sheet đã có trước khi yêu cầu gửi lại |
| Hongloan, ảnh chat 16/09/2026 | Cập nhật báo cáo tất cả bộ phận; số liệu khớp nguồn để planner dùng làm kế hoạch |
| Yêu cầu 16/07 trong hồ sơ | Ghi chú dòng, FR%, MB theo dòng, yêu cầu đóng gói, hạn giao, container, hồ sơ khách và cảnh báo khách mới |

Tin nhắn “đã fix” là thông báo lịch sử; muốn xác nhận hiện tại phải đối chiếu code, dữ liệu và bản triển khai. Các trường trong hàng cuối đã xuất hiện trong source được đọc; không tiếp tục coi tất cả là Pending chỉ vì bảng bàn giao cũ ghi vậy.

## Các luồng cần giữ đúng

1. Nhập PI và các dòng → lưu nháp nếu thiếu thông số → bổ sung → duyệt khi đầy đủ. Code duyệt từ một dòng nháp kiểm tra các dòng cùng PI.
2. Chọn dòng hàng → gán máy/ngày → kiểm tra trùng lịch. Nháp có thể giữ chỗ; duyệt chuyển lịch giữ chỗ thành chính thức.
3. Nhận báo cáo → xem trước → kiểm tra và xác nhận → lưu → xem tiến độ/tồn → đối soát lại nguồn.
4. Badge DONE hiện tính từ lịch đã hết; không chứng minh đủ sản lượng, đã đóng gói hay giao hàng.

Chi tiết điều kiện và ngoại lệ: [business-logic-workflows.md](business-logic-workflows.md).

## Nguồn

- [Project brief](<../../../Sofware Develoment/SNY Planner tool Project brief.docx>), [SRS](<../../../Sofware Develoment/SNY_Planner_Tool_SRS_v1.0.docx>).
- [Yêu cầu bàn giao](../../../tailieubangiao/REQUIREMENTS_MASTER.md), [bàn giao tổng](../../../tailieubangiao/PROJECT_HANDOVER.md).
- Ảnh chat và ảnh A/B người dùng cung cấp trong hội thoại ngày 21/09/2026; chưa có bản sao ảnh độc lập trong bộ Markdown này.
