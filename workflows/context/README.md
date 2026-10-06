# Context bàn giao SNY — đọc từ đây

Cập nhật: 22/09/2026. Bộ tóm tắt dùng khi tiếp nhận dự án và lập kế hoạch thay đổi. Tài liệu gốc, code hiện tại và bằng chứng nghiệm thu có vai trò khác nhau; trạng thái “Done” trong bàn giao cũ không xác nhận bản đang chạy đã đúng.

## Nắm dự án trong 5 phút

SNY Planner phục vụ bộ phận kế hoạch và thống kê của nhà máy SNY VINA. Hệ thống tập trung đơn nhiều dòng, lịch 40 máy dệt, sản lượng các công đoạn và tồn nguyên liệu để planner có số liệu đáng tin cậy khi lập kế hoạch.

Luồng nhà máy: nhận PO/PI → chuẩn bị dòng hàng/thông số → lập kế hoạch máy và nguyên liệu → kéo sợi → mắc sợi → dệt → cuộn → đóng gói → đối soát tiến độ. Phần mềm chưa cưỡng chế toàn bộ luồng thành các bước phê duyệt nối tiếp.

Yêu cầu trọng tâm mới nhất trong ảnh chat: báo cáo của tất cả bộ phận phải vào hệ thống, số liệu khớp báo cáo gửi về và đủ dùng để làm kế hoạch. Import chạy thành công chưa đủ chứng minh yêu cầu này hoàn thành.

## Các bản tóm tắt

| Đọc khi cần | File |
|---|---|
| Mục tiêu, người dùng, yêu cầu khách và phạm vi | [01 — Sản phẩm và yêu cầu](handover-01-product-requirements.md) |
| Công thức đơn hàng, Work Order, MB, bảng A/B và giới hạn suy luận | [02 — Công thức và cấu hình](handover-02-formulas-recipes.md) |
| Báo cáo từng bộ phận, tồn kho, cách đối soát và lỗi cần chú ý | [03 — Báo cáo và độ đúng dữ liệu](handover-03-reports-data.md) |
| Nguồn gốc tài liệu, lịch sử bàn giao, việc còn làm và cách tra cứu | [04 — Tiếp nhận và nguồn bằng chứng](handover-04-delivery-sources.md) |

## Tra cứu sâu khi sửa một luồng

- [Actor và entity](business-logic-actors-entities.md).
- [Luồng nghiệp vụ và trạng thái](business-logic-workflows.md).
- [Rule trong code và assertion của test](business-logic-rules-and-tests.md).
- [Nghiệp vụ từ Excel/PO](business-logic-original-sources.md).
- [Danh mục nguồn và mức độ đã đọc](business-logic-source-coverage.md).
- [Các điểm cần đối chiếu thêm](business-logic-open-questions.md).
- [Kết quả rà nguồn ngày 22/09](handover-recheck-2026-09-22.md) và [plan hiện hành: các yêu cầu chat và đối soát bàn giao](../plans/current-customer-requests-plan.md).
- [Plan màu/công thức cũ](../plans/product-color-recipe-plan.md) chỉ giữ làm lịch sử; không dùng để triển khai song song với plan hiện hành.

## Cách dùng context

1. Đọc bản tóm tắt phù hợp, sau đó mở nguồn được dẫn cho quyết định sắp thay đổi.
2. Phân biệt: yêu cầu khách; ví dụ/công thức nguồn; hành vi code; đề xuất thiết kế; kết quả kiểm thử/nghiệm thu.
3. Chỗ chưa chắc phải có bằng chứng và phạm vi ảnh hưởng; tra tài liệu gốc trước khi hỏi khách. “Chưa tìm thấy” không đồng nghĩa “khách chưa bàn giao”.
4. Các cách diễn giải làm tròn, heating và cột BEAM trong bản rà trước cần đọc kèm mức chắc chắn ở file 02/03. Không nâng suy luận hợp lý thành quy tắc đã được khách xác nhận.

Từ 23/09/2026, người dùng yêu cầu đưa toàn bộ `workflows/` vào Git trên nhánh develop, thay cho yêu cầu giữ context local trước đó. AGENTS và các test local bị ignore không thuộc thay đổi này. Nguồn gốc ngoài repo được liên kết tới thư mục SNY bên cạnh; nếu chỉ chép repo sang máy khác thì phải chuyển kèm hồ sơ gốc để mở các liên kết đó.
