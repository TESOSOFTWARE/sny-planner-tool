# Actor, mục đích và entity nghiệp vụ

Đây là phần tách từ báo cáo business logic tổng. Nó mô tả hệ thống phục vụ ai và dữ liệu nghiệp vụ liên quan với nhau thế nào.

## Dự án phục vụ ai, giải quyết bài toán gì?

SNY Planner Tool phục vụ nhân sự lập kế hoạch và theo dõi sản xuất tại nhà máy lưới SNY VINA: Dung phụ trách kế hoạch, Loan tham gia lập kế hoạch/kiểm thử nghiệp vụ, ông Kim là stakeholder lãnh đạo theo SRS. Hệ thống tập trung thông tin đơn theo PI, lịch máy, sản lượng các công đoạn và tồn nguyên liệu để giảm việc đối chiếu nhiều file Excel rời rạc, hỗ trợ biết đơn cần sản xuất bao nhiêu, đã xếp máy nào và đã ghi nhận được bao nhiêu sản lượng.

Mục tiêu tài liệu là thay bốn file Excel bằng một hệ thống; thực tế code hiện tại vẫn dùng Excel làm nguồn nhập quan trọng. Chuỗi nghiệp vụ được mô tả là nhận đơn → lập kế hoạch máy/nguyên liệu → kéo sợi → mắc/cuốn sợi → dệt → Rolling → đóng gói. Đây là chuỗi hoạt động của nhà máy, **chưa phải workflow bắt buộc hoàn tất công đoạn trước mới cho làm công đoạn sau**.

Nguồn: [CLAUDE.md, mục 1–3 và backlog](../../sny-planner-tool/CLAUDE.md), [bối cảnh đơn nháp](../../sny-planner-tool/docs/specs/f1-draft-order.md), [yêu cầu đã xác nhận và còn thiếu](../../sny-planner-tool/docs/customer-requirement-gaps.md).

## Actor/role và phạm vi thao tác

| Actor nghiệp vụ | Việc hệ thống hỗ trợ | Giới hạn/quyền chưa được xác nhận |
|---|---|---|
| Planner: Dung; Loan là Planner/UAT Tester theo SRS | Tạo/sửa đơn và dòng hàng; lưu nháp, duyệt; giữ chỗ/xếp/sửa/gỡ lịch máy; nhập báo cáo; xem tiến độ và nhu cầu sợi | Duyệt là kiểm tra tính đầy đủ của đơn, chưa có cơ chế duyệt theo chức danh hoặc cấp quản lý; không nên xếp Loan thành người chỉ xem |
| Thủ kho và bộ phận thống kê theo quy trình trong SRS | Thủ kho cung cấp tồn; thống kê cập nhật báo cáo sản lượng. Chức năng hỗ trợ nhập tồn, nhập/xuất, ngưỡng cảnh báo và báo cáo các công đoạn | Chưa có tài khoản hay quyền riêng cưỡng chế việc ai chỉ được nhập kho/nhập sản lượng |
| Ông Kim: Leadership/Stakeholder theo SRS | Theo dõi tình hình qua planner/báo cáo; hệ thống có PO Summary, lịch và tiến độ | Vai trò này có nguồn tài liệu, nhưng quyền duyệt cụ thể và mức độ trực tiếp sử dụng chưa được xác nhận; chưa có vai trò chỉ đọc trong code |
| Nhân viên kinh doanh | Cung cấp thông tin khách hàng, PI và thông số để planner tạo đơn, có thể chưa đầy đủ | Tài liệu có mô tả vai trò ngoài quy trình phần mềm; chưa thấy luồng Sales riêng hay quyền Sales |
| Khách mua hàng của SNY | Được quản lý thông tin liên hệ, các đơn và bảng màu tiêu chuẩn | Là đối tượng dữ liệu, chưa thấy portal hoặc tài khoản khách hàng |

**Không nên diễn giải bảng trên thành ma trận phân quyền đã triển khai.** Schema không có User/Role; các route nghiệp vụ đã đọc không kiểm tra đăng nhập/quyền; tài liệu để Admin/Planner/Viewer trong backlog. Vì vậy không có bằng chứng cho các rule như “chỉ admin được xóa” hoặc “viewer không được sửa”. Các giới hạn hiện có là điều kiện dữ liệu, ví dụ không xóa khách đang có đơn liên kết, không xếp trùng lịch qua luồng gán máy thủ công.

Nguồn: [SRS v1.0, stakeholders và quy trình](<../../Sofware Develoment/SNY_Planner_Tool_SRS_v1.0.docx>), [schema](../../sny-planner-tool/prisma/schema.prisma), [duyệt đơn](../../sny-planner-tool/src/app/api/orders/[id]/approve/route.ts), [khách hàng](../../sny-planner-tool/src/app/api/customers/[id]/route.ts), [gán máy](../../sny-planner-tool/src/app/api/assignments/route.ts).

## Entity nghiệp vụ và quan hệ

| Entity | Ý nghĩa và quan hệ |
|---|---|
| PI / nhóm PO | PI là Proforma Invoice, mã nhóm đơn chính. Không có bảng header PI riêng; PO Summary gom các `ProductionOrder` có cùng `piNumber` |
| `ProductionOrder` | Thực chất là **một dòng hàng/sub-line** trong PI, có màu, khổ, GSM, kiểu đặt mét/cuộn/tấm và thông số riêng. Cặp `piNumber + subLineIndex` là duy nhất; một PI có thể có nhiều dòng |
| `Customer` | Hồ sơ khách hàng, tên duy nhất theo ràng buộc DB, thông tin liên hệ và quốc gia. Một khách có nhiều dòng đơn và nhiều mẫu màu. Đơn vẫn giữ tên khách dạng text, còn `customerId` được phép trống |
| `ColorPreset` | Mẫu màu theo khách, chứa màu, MB code/nhà cung cấp, wale/cours, thông tin eyelet. Có khóa ghép khách + màu + MB code; MB code nullable nên không nên coi đây là bảo đảm tuyệt đối chống mọi mẫu trùng |
| `MachineAssignment` | Một dòng đơn được phân công cho một máy trong khoảng thời gian, có thể kèm số mét phân bổ và năng suất dự kiến nhập tay. Một dòng đơn có thể có nhiều assignment, kể cả trên nhiều máy đồng thời. `isPlaceholder` phân biệt giữ chỗ cho nháp với lịch chính thức |
| `MachineSpec` | Khổ máy dệt theo mã máy. Luồng gán máy mới dùng 40 mã `M-001`…`M-040`; mã máy trong assignment là chuỗi, không phải quan hệ bắt buộc tới bảng này |
| `Material` | Nguyên liệu thuộc `HDPE`, `MB` hoặc `KOREA`, tồn hiện tại, đơn vị mặc định kg, ngưỡng tối thiểu tùy chọn; MB có thêm màu/hãng. Không có ràng buộc unique tên vật tư trong schema |
| `MaterialTransaction` | Phát sinh nhập hoặc một trong bốn loại xuất, gắn với vật tư. `orderId` nếu có chỉ là chuỗi tham chiếu, không phải FK tới đơn. Có thể thuộc một snapshot báo cáo |
| `MaterialReportSnapshot` | Bản chốt báo cáo của một vật tư/ngày: tồn đầu, nhập, các loại xuất, tồn cuối, phiên bản và dấu nhận diện nội dung. Mỗi vật tư/ngày chỉ có một snapshot |
| `ExtruderDailyOutput`, `WarpingDailyOutput` | Sản lượng kg theo máy/ngày/ca/màu, kèm thông số và mã PI thô. Quan hệ tới một dòng đơn là tùy chọn; chưa ghép được vẫn giữ báo cáo. Mã kéo sợi `EXT-xx`, mắc sợi `WARP-xx` khác máy dệt |
| `KnittingDailyOutput` | Tổng mét dệt theo **máy + ngày**, duy nhất theo cặp này, không có FK đơn. Là nguồn tính tiến độ đơn thông qua lịch máy |
| `KnittingDailyDetail` | Chi tiết dệt theo ca, màu, thông số và PI, có thể liên kết dòng đơn; giữ cả thông số/ghi chú máy. Không thay thế bảng tổng mét/ngày trong phép tính tiến độ |
| `RollingDailyMetric` | Chỉ số Rolling theo ngày/dòng nguồn/nhãn chỉ số: số lượng, mét, kg theo nhãn ca hoặc SMALL/BIG. Giữ PI thô và liên kết đơn tùy chọn |
| `PackingDailyOutput` | Tổng đóng gói **toàn nhà máy theo ngày**, một bản ghi/ngày, gồm số lượng/mét/kg của ca ngày và ca đêm; không có quan hệ tới PI |
| `ScheduleImportLog` | Lưu thông tin đợt nhập lịch và bản sao các lịch bị thay thế để tra cứu; có log không đồng nghĩa đã có màn hình khôi phục đầy đủ |

Nguồn chính: [schema hiện tại](../../sny-planner-tool/prisma/schema.prisma), [PO Summary](../../sny-planner-tool/src/components/orders/POSummaryTable.tsx).
