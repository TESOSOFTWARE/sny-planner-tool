# Công thức, ràng buộc, ngoại lệ và test

## Công thức số lượng và nhu cầu sợi

| Kiểu đơn | Input bắt buộc thêm ngoài PI/khách/ngày/khổ/GSM/màu | Tổng mét |
|---|---|---|
| `meters` | Chiều dài tổng > 0 | `lengthM` |
| `rolls` | Số cuộn nguyên > 0, mét/cuộn > 0 | `qty × rollLength` |
| `pieces` | Số tấm nguyên > 0, chiều dài tấm > 0 | `qty × pieceLength` |

- Diện tích `qtySqm = widthM × tổng mét`.
- Trọng lượng trên đơn `totalWeightKgs = qtySqm × gsm / 1000`.
- Nhu cầu sợi nội bộ `requiredYarnKg = qtySqm × (productionGsm nếu có, nếu không dùng gsm) / 1000 × 1.05`.
- 1.05 là cộng 5% hao hụt, không phải chia cho 95%. Tài liệu giải thích GSM sản xuất có thể khác GSM khách đặt để bù đặc tính/co giãn và yêu cầu trọng lượng; code không bắt buộc GSM sản xuất >= GSM đặt hàng.
- Ví dụ 10 cuộn × 100 m/cuộn × khổ 2 m = 2.000 m². GSM đặt 100 cho trọng lượng đơn 200 kg; GSM sản xuất 110 cho nhu cầu sợi 231 kg.
- Thiếu input không tự lấy chiều dài cũ để bù cho đơn cuộn/tấm. Có thể giữ kết quả từng phần: biết tổng mét nhưng chưa có khổ thì mét có giá trị, diện tích/kg chưa có.

Nguồn: [công thức](../../sny-planner-tool/src/lib/calculations/orderWeight.ts), [lý do GSM sản xuất](../../sny-planner-tool/docs/specs/i2-production-gsm.md), [test công thức](../../sny-planner-tool/src/lib/calculations/orderWeight.test.ts).

## Các giới hạn đang được code hóa

- Khổ > 0 và <= 20 m; GSM đơn/GSM sản xuất là số nguyên > 0 và <= 500; tổng mét <= 100.000 cho cả ba kiểu đơn. Đây là giới hạn validation hiện tại, chưa có tài liệu chứng minh là giới hạn vật lý của xưởng.
- UV% và FR% trong 0–100 nếu nhập. Chọn `frFlag = true` thì FR% phải > 0, kể cả lưu nháp qua kiểm tra trạng thái cuối. Không chọn FR chưa có rule bắt buộc FR% phải trống/0.
- Số kim, số dàn, số dòng eyelet nếu nhập phải nguyên dương; chưa thấy rule buộc có màu/quy cách eyelet khi bật `hasEyelet`.
- Ngày đặt/giao được kiểm tra ngày lịch hợp lệ ở schema chung; chưa thấy rule ngày giao phải sau ngày đặt hoặc ngày kết thúc lịch phải trước hạn giao. Đường sửa hàng loạt PI không dùng cùng bộ kiểm tra đầy đủ này.
- Mỗi lần confirm nhập đơn tối đa 5.000 dòng; confirm tồn tối đa 500 dòng; confirm đóng gói tối đa 366 dòng/ngày theo kiểm tra payload hiện tại.
- PO Summary bỏ dòng nháp khỏi tổng diện tích, trọng lượng đơn và nhu cầu sợi; nếu không có số hợp lệ thì để trống thay vì coi null là số lượng thật bằng 0. Nhiều tên khách cùng PI được cảnh báo, không có bảng PI riêng cưỡng chế “một PI chỉ một khách”.
- Xóa khách bị chặn khi có đơn liên kết qua `customerId`; đơn chỉ giữ tên text không được tính vào điều kiện này. Đổi tên hồ sơ khách chưa thấy tự cập nhật tên text trên các đơn cũ.
- Xóa dòng đơn kéo theo xóa assignment; các báo cáo kéo/mắc/dệt chi tiết/Rolling giữ bản ghi nhưng FK đơn thành null. Không thấy chặn xóa đơn vì đã có sản lượng.
- Trường nguồn đơn phân biệt `manual`, `import`, `seed`; tài liệu nói dữ liệu seed không dùng cho AI tương lai. Đây chưa phải chức năng huấn luyện AI đã triển khai.

Nguồn: [validation](../../sny-planner-tool/src/lib/validations/order.ts), [schema](../../sny-planner-tool/prisma/schema.prisma), [PO Summary](../../sny-planner-tool/src/components/orders/POSummaryTable.tsx), [khách hàng](../../sny-planner-tool/src/app/api/customers/[id]/route.ts), các route confirm ở [phần workflow](business-logic-workflows.md).

## Test thể hiện hệ thống phải làm gì

Đã đọc tên test và assertion; **không chạy test trong nhiệm vụ này**. Các ví dụ dưới đây là yêu cầu được diễn đạt trong test, không phải báo cáo test đã pass:

| Nhóm test | Hành vi được assertion bảo vệ |
|---|---|
| [Tính trọng lượng](../../sny-planner-tool/src/lib/calculations/orderWeight.test.ts) | Tăng số cuộn làm tổng mét/kg tăng tương ứng; tấm dùng chiều dài tấm; thiếu input cuộn/tấm không lấy `lengthM` dự phòng; giữ kết quả từng phần, không nhận tổng mét vô hạn/quá lớn |
| [Validation import](../../sny-planner-tool/src/lib/validations/orderImport.test.ts) | Đơn cuộn đủ qty/mét-cuộn được thiếu LENGTH; đơn mét thiếu LENGTH bị từ chối; ngày không tồn tại, khổ/GSM/tổng mét vượt giới hạn bị từ chối; nháp được thiếu thông số còn chính thức thì không |
| [Nhập đơn](../../sny-planner-tool/src/lib/excel/parseOrderList.test.ts) | NO tự sinh không đụng NO rõ ràng; dòng cùng khóa khác nội dung là conflict; dòng giống bỏ qua; không duyệt nháp bằng import |
| [Giữ liên kết báo cáo](../../sny-planner-tool/src/lib/excel/preserveOrderLinks.test.ts) | Giữ liên kết sub-line khi sửa số lượng; không chọn tùy tiện giữa nhiều dòng; bỏ/đổi định danh dòng đã liên kết bị chặn; không phụ thuộc thứ tự hàng; xét cả độ làm tròn số như DB |
| [Bảo vệ lịch](../../sny-planner-tool/src/lib/schedule/importSafety.test.ts) | Tính cả ngày cuối/ngày duy nhất; không lấy ngày liền trước/sau; xung đột lịch giữ lại phải lan sang phần lịch thay liên quan nhưng không chặn vùng độc lập |
| [Báo cáo tồn](../../sny-planner-tool/src/lib/excel/parseMaterialReport.test.ts) | Tên vật tư dạng số và tồn 0 vẫn là dữ liệu; số hỏng/tồn âm không được lặng lẽ đổi thành 0; nhiều block phải chọn; trùng tên chuẩn hóa bị báo lỗi; không tự lấy sheet khác |
| [Đóng gói](../../sny-planner-tool/src/lib/excel/parsePackingReport.test.ts) | Phân biệt trống và 0; cùng ngày giống thì gộp, khác thì từ chối; không nhận số lượng lẻ/ngày sai/ngày kèm giờ |
| [Test thủ công Phase 1, TC-12/13/14](../../sny-planner-tool/docs/test-cases/TC_PHASE1_MANUAL.md) | Gán máy trống thành công; khoảng ngày chồng lịch bị chặn; ngày bắt đầu sau ngày kết thúc không được gửi |

File tên [complete-existing-flows.test.ts](../../sny-planner-tool/tests/integration/complete-existing-flows.test.ts) hiện chỉ kiểm tra cấu hình DB test an toàn, **không kiểm thử đầy đủ các luồng nghiệp vụ end-to-end**. Tài liệu test thủ công còn để ô trạng thái trống và có mô tả màn hình cũ; không dùng chúng làm bằng chứng mọi flow hiện tại đã chạy thành công.
