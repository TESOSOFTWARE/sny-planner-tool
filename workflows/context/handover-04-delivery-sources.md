# 04 — Tiếp nhận dự án, nguồn bằng chứng và việc tiếp theo

## Tài liệu nào trả lời việc gì?

| Nguồn | Nội dung cần giữ | Cách dùng |
|---|---|---|
| Project brief | Bài toán Excel rời rạc, mục tiêu và các giai đoạn | Khung mục tiêu, không dùng xác nhận tính năng đã chạy |
| SRS v1.0 | Người dùng, yêu cầu, use case, phạm vi/backlog | Đối chiếu thời điểm và code vì trạng thái có thể cũ |
| Hai bản Demo PPTX | Tầm nhìn BOM, kế hoạch, mô phỏng, AI | Ý tưởng/phạm vi sản phẩm, không phải chứng cứ hoàn thành |
| Pre-meeting Questions v2 | Danh sách câu hỏi khảo sát | Câu hỏi chưa phải câu trả lời hay rule được duyệt |
| PROJECT_HANDOVER / REQUIREMENTS_MASTER / CONFLICTS_AND_GAPS / Blueprint | Quyết định lịch sử, sự cố, công thức code, hạng mục mở, bàn giao vận hành | Chú ý phạm vi nguồn mà tác giả đã đọc; đối chiếu Excel/PO gốc |
| 6 file “Tổng hợp thông tin dự án” | Tổng quan, nghiệp vụ, use case, flow, câu hỏi và đối chiếu source | Nguồn thứ cấp hỗ trợ tra cứu |
| 14 workbook, 4 PDF PO | Dữ liệu, công thức, hướng dẫn xưởng và yêu cầu từng đơn | Giữ file/sheet/ô hoặc PO làm căn cứ |
| CLAUDE.md, docs/specs, test và source | Lịch sử sprint và hành vi hiện tại | Source chứng minh có logic; chạy kiểm thử và đối soát mới chứng minh kết quả |
| plans và workflows | Audit, kế hoạch và đề xuất của các lượt làm việc | Không coi đề xuất là khách đã duyệt hoặc đã triển khai |
| luu-source-cu | Demo/bản lưu trước | Dùng hiểu lịch sử; công thức giả lập không thay định mức thật |

## Các điểm bàn giao lịch sử đáng nhớ

- Hồ sơ cũ nói đã khôi phục assignment cho PI CVellis26-2 ngày 15/08 và đối soát 3.200 m. Đây là sự kiện được tài liệu kể lại; cần kiểm tra môi trường hiện hành nếu dùng làm bằng chứng phục hồi. Source local được đọc đã có bảo vệ import lịch có sản lượng.
- Có workbook `outputs/orderref_unmatched_review.xlsx` gồm 18 dòng review theo audit trước. Đọc file này trước khi hỏi lại danh sách chưa nối đơn; không tự nối các dòng mơ hồ.
- Có backup SQL/archive lịch sử. Chúng là snapshot theo thời điểm, không đại diện DB hiện tại; không restore vào DB thật chỉ để kiểm tra.
- Tài liệu bàn giao cũ ghi sự cố credential DB từng bị commit công khai. Trạng thái rotate/xử lý hiện tại chưa được xác minh trong nhiệm vụ tóm tắt; lưu việc cần đối chiếu với chủ môi trường, không sao chép credential vào context.
- Một số tài liệu được handover tham chiếu như PROJECT_STATE, TECHNICAL_HANDOVER, HANDOVER_ACCESS_CHECKLIST, STAKEHOLDERS chưa thấy trong inventory cũ. Không dựng nội dung thay và không kết luận chúng không tồn tại ở nguồn ngoài workspace.
- Next.js/TypeScript/Prisma/PostgreSQL là nền tảng code; Vercel/Neon được hồ sơ mô tả. Quyền truy cập, cấu hình deploy và tình trạng production cần xác minh riêng. Hướng dẫn push main của repo cũ không phải lệnh deploy cho working copy này.

## Những điều chỉnh cần đọc trước khi dùng audit cũ

1. “Không có Product Recipe/loss” trong handover cũ dựa trên phạm vi CLAUDE/specs; Excel và ảnh bổ sung có công thức/thông số liên quan.
2. SRS xác định vai trò Dung/Loan/ông Kim rõ hơn một số bản tổng hợp chỉ đọc code.
3. Các mục FR%, ghi chú, đóng gói, MB theo dòng, khách hàng... có thể đã có code dù bảng cũ còn ghi Pending.
4. Work Order đã có công thức và đơn vị input. Mapping dữ liệu hiện có và quy tắc làm tròn tổng quát vẫn phải phân biệt với ví dụ nguồn.
5. BEAM thứ hai có bằng chứng tính bì từ công thức; BEAM thứ nhất là loại/spec mới là suy luận đối chiếu. Không coi mọi kết luận trong audit 22/09 là xác nhận trực tiếp của khách.
6. Không tìm thấy công thức heating không chứng minh heating không ảnh hưởng vật lý; trọng số của một đơn không tự áp cho A/B khác.

## Thứ tự công việc tiếp theo

1. Đối chiếu các yêu cầu chat với toàn luồng nhập tay/Excel/sửa nháp, ghi kết quả theo phiên bản code.
2. Lập bảng bao phủ tất cả báo cáo/sheet; ưu tiên mất dòng, trùng import, gán sai đơn và lệch tổng ảnh hưởng kế hoạch.
3. Số hóa công thức và bảng A/B theo nguồn; giữ các tham số chưa xác nhận là dữ liệu cần bổ sung, không đặt default tùy đoán.
4. Chốt phần tích hợp còn thiếu trong plan: ownership/version recipe, cách chọn A/B, trọng số chính xác, điều kiện chọn hệ số và quy tắc cập nhật báo cáo còn thiếu.
5. Kiểm thử phù hợp rồi đối soát trên môi trường được phép; cuối cùng planner xác nhận số liệu đủ dùng. Build/test pass không thay UAT.

Đây là thứ tự đề xuất; [plan chi tiết](../plans/product-color-recipe-plan.md) vẫn ở bước Plan. Yêu cầu hiện tại chỉ cho phép tổng hợp tài liệu, không tự thực hiện các thay đổi sản phẩm.

## Đường dẫn nguồn

- [Tài liệu sản phẩm](<../../../Sofware Develoment/>).
- [Bộ bàn giao](../../../tailieubangiao/), [tổng hợp 6 tài liệu](<../../../Tổng hợp thông tin dự án/>).
- [Excel/PO gốc](<../../../User Raw Documents/>).
- [Audit công thức](../../../plans/HANDOVER_FORMULA_AUDIT_2026-09-19.md), [audit tổng](../../../plans/SNY_FULL_AUDIT_2026-09-19.md), [inventory](../../../plans/SNY_FILE_INVENTORY_2026-09-19.md), [kế hoạch cũ](../../../plans/SNY_IMPLEMENTATION_PLAN_2026-09-18.md).
- [CLAUDE.md](../../CLAUDE.md), [specs](../../docs/specs/), [schema](../../prisma/schema.prisma), [AGENTS.md](../../AGENTS.md).

## Mức độ bao phủ

Theo bộ trích xuất và inventory đã lập: 14 workbook gốc/629 sheet, 6 Word/PPTX, 4 PDF PO, Markdown bàn giao và tổng hợp. Quét/trích nội dung tất cả sheet khác với kiểm chứng thủ công mọi ô/công thức; macro, hình nhúng, external link và tính lại Excel chưa được kiểm chứng toàn bộ. Lượt này cô đọng các nguồn và kết quả đã đọc, không thực hiện lại audit mọi ô hoặc kiểm tra production.

Trước khi đưa câu hỏi cho khách, ghi nguồn đã tra, bằng chứng liên quan và đúng phần chưa trả lời. Giữ riêng câu hỏi nội bộ về code với quyết định nghiệp vụ cần khách xác nhận; không buộc khách giải đáp tên biến do dev đặt.
