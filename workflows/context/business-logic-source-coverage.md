# Phạm vi nguồn đã rà và mức độ kiểm chứng

Đã rà tất cả các thư mục cấp đầu của `SNY` trong ảnh người dùng; tên trên đĩa có chỗ khác chính tả. “Đọc toàn SNY” ở đây là kiểm kê mọi nguồn, trích nội dung/công thức của mọi sheet và đọc sâu vùng quyết định nghiệp vụ; không khẳng định một người đã đọc thủ công từng ô trong 2.875.311 ô dữ liệu hay kiểm toán từng dòng thư viện kỹ thuật. Kết quả rà lại bốn điểm dễ hiểu sai nằm tại [handover-recheck-2026-09-22.md](handover-recheck-2026-09-22.md).

| Thư mục | Nguồn đã đọc/đối chiếu |
|---|---|
| `Sofware Develoment` | Toàn bộ 3 DOCX: Project brief, SRS v1.0, Pre-meeting Questions v2; cả 2 PPTX, gồm 11 và 9 slide. Đọc phần chữ/bảng/notes và xem hình nhúng. Bộ câu hỏi trước họp là câu hỏi chưa có đáp án, không phải rule được duyệt |
| `tailieubangiao` | Toàn bộ PROJECT_HANDOVER, REQUIREMENTS_MASTER, CONFLICTS_AND_GAPS và Blueprint DOCX |
| `Tổng hợp thông tin dự án` | Cả 6 tài liệu: tổng quan, nghiệp vụ, use cases, user flow, câu hỏi bàn giao, đối chiếu source/bàn giao 17/09; dùng làm nguồn tổng hợp thứ cấp, đối chiếu lại khi có khẳng định khác source |
| `User Raw Documents` | Cả 14 workbook (629 sheet; 2.875.311 ô có dữ liệu; 1.211.858 ô công thức được lập chỉ mục) và 4 PDF PO. Quét nội dung ô, công thức, ghi chú, cấu trúc mọi sheet; đọc sâu các vùng công thức, điều kiện và ngoại lệ nêu trong tài liệu nguồn. Xem trang PDF để đọc bảng dạng ảnh |
| `plans` | Hai audit 19/09, kế hoạch triển khai 18/09, danh mục file lịch sử. Danh mục cũ dùng đối chiếu nguồn, không giả định mọi file được kể còn hiện diện hoặc mọi đề xuất đã thực hiện |
| `luu-source-cu` | Migration record; tài liệu demo và roadmap; type, state đơn, parser/test, template beam và dữ liệu mẫu để phân biệt giả lập với nghiệp vụ thực. ZIP `SYN-main.zip` có 60 file: 59 trùng byte với bản ngoài ZIP; file khác là lockfile dependency |
| `sny-planner-tool` | Tài liệu sản phẩm/spec/test, schema, validation, công thức, API/workflow, parser/import và test liên quan quyết định nghiệp vụ; thêm workbook review unmatched và template nguyên liệu (2 sheet). Phân tích code hiện có, không chạy ứng dụng trên DB thật |
| `workflows` | Đối chiếu/cập nhật chính các tài liệu tổng hợp; đây là đầu ra phân tích, không dùng làm chứng cứ độc lập cho nghiệp vụ |

## Danh mục workbook đã quét

| Workbook | Số sheet | Vai trò nghiệp vụ |
|---|---:|---|
| CC2018 ok.xlsb | 440 | Thông số sản xuất/beam theo nhiều sản phẩm, hướng dẫn thao tác và loss |
| CHỈ KÉO SỢI THÁNG 04-2026 | 4 | Tổng hợp sợi theo kỳ/mã, đối chiếu số lượng |
| CHỈ KÉO SỢI THÁNG 05-2026 | 4 | Tổng hợp sợi theo kỳ/mã, có phần kỳ trước lặp lại |
| EXTRUDER 2023 | 18 | Lệnh/thông số kéo sợi, ghi chú và công thức lịch sử |
| EXTRUDER 2024 + extruder 2025 O | 40 | Kế hoạch kéo sợi, phối hợp beam/máy dệt và chỉ dẫn theo đơn |
| Formular | 1 | Công thức mét/kg/sợi trên beam viết bằng văn bản |
| ORDER LIST OFFICIAL 2023-2026 | 1 | Đơn nhiều dòng, NO theo PI, diện tích và trọng lượng |
| Production schedule 1 2026 | 11 | Các phiên bản lịch máy; thông số/ghi chú trong ô lịch |
| SẢN LƯỢNG KÉO SỢI | 66 | Kế hoạch so với sản lượng và phần còn lại; theo dõi UV/FR |
| SNY - Timeline | 2 | Kế hoạch dự án, không phải lịch sản xuất nhà máy |
| STATISTICAL REPORT 04-2026 | 18 | Kho, các công đoạn sản xuất, chỉ tape, tổng hợp/chart |
| STATISTICAL REPORT 05-2026 | 13 | Báo cáo tương tự tháng 5; cấu trúc không hoàn toàn giống tháng 4 |
| Template_Knitting_Report (1) | 1 | Chi tiết dệt, số lượng/mét/kg và chỉ số năng suất |
| kế hoạch đặt MB 2025 | 10 | Mua/nhận MB, tồn, công thức nhu cầu màu/FR |
| outputs/orderref_unmatched_review | 1 | Danh sách đối chiếu mã đơn chưa liên kết, là snapshot xuất trước đó |
| public/templates/nvl-template | 1 | Mẫu nhập tồn nguyên liệu; hướng dẫn mapping cột |
| **Tổng** | **631** | **16 workbook, gồm 14 nguồn gốc và 2 file trong repo** |

## Giới hạn kiểm chứng

Đã quét toàn bộ sheet nhưng chưa xác nhận thủ công từng ô/công thức lịch sử, chưa tính lại Excel hay thực thi macro. Không đọc từng dòng dependency, build cache, lockfile, định dạng hoặc helper không quyết định nghiệp vụ; không đưa credential vào báo cáo. Không chạy test/import/migration, không thay đổi source hay dữ liệu gốc. Các câu hỏi còn mở ở [business-logic-open-questions.md](business-logic-open-questions.md) và các mâu thuẫn ở [business-logic-original-sources.md](business-logic-original-sources.md) cần chủ nghiệp vụ xác nhận; chúng không ngăn việc hoàn thành bản đọc hiểu này.
