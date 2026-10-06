# Business logic — SNY Planner Tool

Bắt đầu từ [README context](README.md) để đọc bộ tóm tắt bàn giao 4 phần; tài liệu này và các file `business-logic-*` giữ phần phân tích chi tiết. Các giới hạn suy luận về làm tròn, heating, MB và BEAM được làm rõ trong bộ tóm tắt mới.

Ngày đọc: 21/09/2026. Đây là mục lục của bản đọc nghiệp vụ toàn bộ thư mục `SNY`. Nội dung được tách theo chủ đề để dễ tra cứu; không phải tài liệu kiến trúc và không phải đề xuất sửa code.

## Kết luận nhanh

SNY Planner Tool phục vụ planner và các bộ phận theo dõi sản xuất tại SNY VINA. Nó tập trung PI/đơn nhiều dòng, lịch máy, báo cáo sản lượng theo công đoạn và tồn nguyên liệu, nhằm giảm việc nối thủ công nhiều file Excel.

Chuỗi nghiệp vụ chính là:

`PO/PI → dòng đơn → duyệt hoặc nháp → xếp lịch/giữ chỗ → kéo sợi → mắc sợi → dệt → Rolling → đóng gói → theo dõi tiến độ và tồn`.

Code hiện đã số hóa nhiều rule về đơn, lịch, import và tồn. Các phần tự xếp lịch, dự báo thiếu nguyên liệu, AI, phân quyền người dùng, chất lượng/claim, mua hàng và giao hàng vẫn là mục tiêu hoặc khoảng trống; không được coi là đã triển khai chỉ vì xuất hiện trong slide/SRS.

## Các tài liệu chi tiết

1. [Actor, mục đích và entity nghiệp vụ](business-logic-actors-entities.md) — hệ thống phục vụ ai, họ làm gì, các entity chính và quan hệ.
2. [Các luồng nghiệp vụ](business-logic-workflows.md) — nhận đơn, import, duyệt, xếp lịch, sản lượng, tồn, Rolling và đóng gói.
3. [Công thức, ràng buộc, ngoại lệ và test](business-logic-rules-and-tests.md) — công thức đang code, giới hạn validation và hành vi mà test bảo vệ.
4. [Điểm mơ hồ cần xác nhận](business-logic-open-questions.md) — các rule chưa đủ rõ để tự suy diễn.
5. [Nguồn nghiệp vụ gốc và mâu thuẫn](business-logic-original-sources.md) — SRS/brief/slide, Excel/PO, công thức beam/MB/FR và các trường hợp ngoại lệ tại xưởng.
6. [Phạm vi nguồn đã rà](business-logic-source-coverage.md) — danh mục thư mục, workbook/sheet, mức độ rà soát và giới hạn kiểm chứng.

## Cách đọc và mức độ tin cậy

Thứ tự đối chiếu là tài liệu nghiệp vụ → schema/model → validation và điều kiện xử lý → workflow/state → test → comment giải thích. Khi tài liệu cũ khác source hiện tại, phần workflow ghi hành vi code đang có và nêu mâu thuẫn ở tài liệu nguồn.

Các file chi tiết có hai loại thông tin:

- **Đang code hóa:** hành vi có bằng chứng trong schema, validation, route, parser, component hoặc test.
- **Nguồn nghiệp vụ cần xác nhận:** công thức/điều kiện thấy trong Excel, PO, SRS hoặc ghi chú xưởng nhưng chưa có mapping rõ trong code.

Không truy cập database/production, không chạy import, migration hay test ghi dữ liệu; không xác nhận chức năng đã triển khai lên môi trường thật. Đã quét toàn bộ sheet workbook, nhưng không khẳng định đã kiểm toán thủ công từng ô lịch sử hoặc từng dòng dependency kỹ thuật.

## Nguồn chính

- [Source hiện tại](../../sny-planner-tool/CLAUDE.md) và [schema](../../sny-planner-tool/prisma/schema.prisma).
- [Tài liệu SRS](<../../Sofware Develoment/SNY_Planner_Tool_SRS_v1.0.docx>), [project brief](<../../Sofware Develoment/SNY Planner tool Project brief.docx>) và [tài liệu bàn giao](../../tailieubangiao/PROJECT_HANDOVER.md).
- [Dữ liệu Excel/PO gốc](<../../User Raw Documents/>) và các nguồn được liệt kê đầy đủ trong [phạm vi rà soát](business-logic-source-coverage.md).
