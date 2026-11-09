# Plan — Production Orders, sản lượng, báo cáo và phân quyền sau họp 30/10

Ngày lập: 06/11/2026. Trạng thái: **DRAFT — để TESO và SNY rà phạm vi; chưa triển khai**.

Cập nhật 09/11/2026: người dùng yêu cầu lập kế hoạch từng task và bắt đầu thực hiện. Đã tạo [10 task card](mom-2026-10-30-tasks/README.md) và [đầu ra khảo sát offline](../context/mom-2026-10-30/README.md). M30-01/02/08 đang khảo sát; các phần triển khai ứng dụng chưa bắt đầu. Quyết định nghiệp vụ còn thiếu vẫn cần chốt theo từng card.

Cập nhật triển khai cùng ngày: người dùng chốt **email/mật khẩu, chưa phân role**; hiện không có ORDER LIST mới và cần **mẫu in khác của SNY**. Đã áp SQL auth local, thêm kiểm tra phiên cho API/page/action, mở menu Reports và view sản lượng thực tế theo PI nguồn. Trạng thái hiện hành nằm ở [chỉ mục task](mom-2026-10-30-tasks/README.md); các mục mô tả baseline bên dưới phản ánh lúc lập plan 06/11, không thay thế trạng thái triển khai mới.

## 1. Mục tiêu và nguồn

Nguồn yêu cầu là nội dung cuộc họp 30/10/2026 do người dùng cung cấp, đặc biệt mục **4. Next-steps phía TESO**. Các mã `M30-01`…`M30-10` dưới đây là mã theo dõi của plan, không phải số mục có sẵn trong MoM. Phản hồi 22/10 đã được khách duyệt theo mục 1 của buổi họp; việc làm lại giao diện để trực quan, đồng bộ được xếp sau các yêu cầu nghiệp vụ trong plan này.

Mục tiêu bàn giao:

1. Mỗi PI và item xem được thông tin sản xuất/đóng gói áp dụng cho chính nó, kèm nguồn và phiên bản.
2. Kế hoạch và sản lượng thực tế theo công đoạn được nhập tay hoặc từ Excel, ghép với đơn một cách kiểm tra được.
3. Kéo sợi có lịch in hằng ngày; dệt có lịch in theo tuần hoặc tháng.
4. Menu báo cáo thống kê thể hiện các chỉ tiêu được SNY chọn từ file tháng 10/2026.
5. Người dùng đăng nhập và chỉ truy cập được dữ liệu, thao tác thuộc quyền được giao.

## 2. Hiện trạng đã kiểm

- Checkout `main` tại `aee1541` (27/10/2026); `README.md` và bộ `workflows/context/ban-giao/00`–`05` cập nhật đến 27/10. Chưa tìm thấy `workflows/context/handover-2026-10-28.md` trong checkout.
- App dùng Next.js 14.2, Prisma 5.22 và PostgreSQL. `ProductionOrder` lưu **một item**, khóa duy nhất `(piNumber, subLineIndex)`; hiện có 70 API route, chưa có model User/Role hay luồng auth. `Reports` còn là menu vô hiệu hóa.
- Bản `ORDER LIST OFFICIAL 2023-2026.xlsx` được cung cấp có 3.345 dòng thuộc 703 PI, 570 PI nhiều item; ngày đặt hàng mới nhất đọc được là **13/05/2026**. Đây chưa phải danh mục đơn hiện hành cho kế hoạch tháng 10.
- `CC2018 ok.xlsx` có 465 sheet, gồm nhiều mẫu Warping Work Order, và 31 ảnh nhúng. Mẫu `UC 26-4` tách **số beam sử dụng**, **loại beam**, số sợi, mét/kg kế hoạch, dàn, máy và ngày chạy. Trường `ProductionOrder.beamCount` hiện có nghĩa **số dàn**, không tương đương số beam sử dụng.
- `kéo sợi 2026.xlsx`, sheet `10.2026`, ghi máy, ORDER dạng mã PI kèm mô tả, màu, MB, gauge, denier, UV/FR và kế hoạch theo các cột ngày. Ô kế hoạch có cả lượng và ghi chú tự do; đây là kế hoạch/hướng dẫn, không đồng nhất với sản lượng thực tế trong `STATISTICAL REPORT`.
- `Hướng dẫn đóng gói 2026`, `KẾ HOẠCH ĐÓNG PALLET`, `KẾ HOẠCH HÀNG MAY D` chứa quy cách tùy từng PI/item. File pallet và hàng may gồm nhiều sheet lịch sử, nhiều bố cục. Một số thông tin đã có trong schema; dây đai, tem, kiểu may, chỉ may, số pallet, kích thước cắt/gấp và các thông số tương tự chưa có trường cấu trúc riêng.
- `STATISTICAL REPORT 10-2026.xlsx` có 14 sheet. HDPE, Extruder, Warping, Knitting và Rolling chứa nguồn tháng 10; `CHART` tính lại từ Knitting. Một số sheet khác là dữ liệu năm cũ, trống hoặc có `#REF!`. Sheet Đóng gói trong file này ghi tháng 01/2026 và không có số sản lượng tháng 10.
- Hệ thống hiện nhập nhiều báo cáo qua `Materials`; tiến độ theo đơn có thể suy từ lịch máy và sản lượng dệt, còn dòng báo cáo chỉ có PI nhưng nhiều item thường không được tự gắn `orderId`.

Nguồn ngoài repo để đối chiếu: [thư mục Drive SNY](https://drive.google.com/drive/folders/1UZ9QkmwmHZqnPFJcGC7lYaUSgd2T6jPd), các file Excel đã được người dùng đính kèm, và MoM 30/10 đã được cung cấp trong chat. Excel là dữ liệu nguồn, không phải chỉ dẫn chạy macro/công thức hoặc thao tác DB.

## 3. Task và đầu ra

| ID | Task | Đầu ra có thể kiểm tra | Điều kiện bắt đầu |
|---|---|---|---|
| M30-01 | Kiểm kê các file Production Orders, từng sheet và phiên bản áp dụng | Ma trận `file/sheet/ô hoặc cột → ý nghĩa/đơn vị → cấp PI hay item → trường trong app → thiếu/trùng/mâu thuẫn → đề xuất lưu hoặc đính kèm` | Làm ngay với file đã có; cần file **ĐẶT HÀNG hiện hành** để chốt độ phủ đơn tháng 10 |
| M30-02 | Đối chiếu mã PI và item giữa các file | Báo cáo số dòng `khớp item / chỉ khớp PI / không khớp / mơ hồ`, ví dụ thật và lý do; quy tắc chuẩn hóa mã và thứ tự đối chiếu thuộc tính | M30-01; có danh mục đơn hiện hành |
| M30-03 | Chốt hợp đồng dữ liệu kế hoạch và thực tế theo công đoạn | Định nghĩa khóa bản ghi, ngày/ca/máy, đơn vị, nguồn, phiên bản, trạng thái liên kết và cách xử lý khi nhập lại/sửa tay | M30-02; SNY/TESO chốt các câu hỏi mục 4 |
| M30-04 | Bổ sung thông tin sản xuất, đóng gói, pallet, hàng may và hình ảnh theo đơn | Thiết kế các trường **chỉ cho dữ liệu cần lọc/tính/in**; thông tin cá biệt giữ được như chỉ dẫn/đính kèm có nguồn, phiên bản và quyền truy cập | M30-01 và M30-03; duyệt phạm vi lưu trữ tệp |
| M30-05 | Tab **Sản lượng** trong Production Orders | Xem kế hoạch/thực tế theo PI → item → công đoạn; nhập trực tiếp và tải Excel theo cùng quy tắc validation; xem trước, xác nhận, kết quả nhận/bỏ/xung đột, dòng chưa ghép | M30-02 và M30-03; môi trường test tách DB production |
| M30-06 | Kế hoạch và bản in kéo sợi hằng ngày | Chọn ngày/máy, cập nhật kế hoạch, xem trước và in đúng mẫu xưởng; bản in ghi thời điểm/phiên bản phát hành | M30-03; SNY duyệt mẫu giấy và cột bắt buộc |
| M30-07 | Bản in lịch dệt theo tuần hoặc tháng | Chọn kỳ, máy/nhóm máy, xem trước và in; số liệu, ngày nghỉ và phiên bản lịch khớp màn hình | SNY duyệt mẫu giấy và quy tắc chọn kỳ |
| M30-08 | Menu **Báo cáo thống kê** | Ma trận 14 sheet với trạng thái `nguồn độc lập / bảng tổng hợp / lịch sử / trống / lỗi`; menu và các tab đã chốt, lọc kỳ và đối soát nguồn → DB → UI; không cộng trùng CHART | Chốt danh sách chỉ tiêu/tab cần nghiệm thu; dùng dữ liệu tháng 10 trước |
| M30-09 | Đăng nhập và phân quyền | Ma trận vai trò × hành động × dữ liệu; tài khoản, phiên đăng nhập, bảo vệ trang, API và thao tác phía server; kiểm tra 401/403 và quyền theo vai trò | SNY/TESO chốt vai trò, cách cấp/thu hồi tài khoản, tài khoản quản trị đầu tiên |
| M30-10 | Kiểm thử tích hợp, đối soát và UAT | Case theo từng task, bộ PI/item mẫu, kết quả file → parser → DB test → UI → bản in; danh sách sai lệch và chữ ký nghiệm thu | M30-04…09 hoàn tất; môi trường test độc lập |

Thứ tự dự kiến: **M30-01 → M30-02 → M30-03 → M30-04/05/06/07/08/09 → M30-10**. M30-08 và M30-09 có thể được thiết kế song song sau khi chốt phạm vi riêng. Bản in, import và màn nhập tay phải dùng cùng một định nghĩa kế hoạch/sản lượng, tránh tạo nhiều số liệu có thẩm quyền.

## 4. Quyết định còn cần chốt

| Chủ đề | Câu hỏi cần trả lời | Người chốt |
|---|---|---|
| Đơn hiện hành | File **ĐẶT HÀNG** nào là nguồn chuẩn cho PI tháng 10 trở đi? Bản ORDER LIST dừng ở 13/05/2026. | SNY/TESO |
| Ghép item | Khi một PI có nhiều dòng, tổ hợp `NO / Item Code / màu / khổ / GSM / chiều dài` nào được xem là định danh đủ? Dòng mơ hồ để người dùng chọn hay giữ chưa liên kết? | SNY |
| Kế hoạch và thực tế | “Quấn chỉ” trong MoM tương ứng bảng/khâu nào; chỉ tiêu và đơn vị theo công đoạn nào cần tính tiến độ; báo cáo sửa cùng kỳ thay thế hay bổ sung? | SNY |
| In xưởng | Mẫu giấy kéo sợi theo ngày và dệt theo tuần/tháng nào là bản chuẩn; cột, cách nhóm, chữ ký, bản sửa và thời điểm chốt lịch? | SNY |
| Báo cáo | Trong 14 sheet, các tab/chỉ tiêu nào cần hiển thị; sheet lịch sử hoặc lỗi có cần phục hồi không; mức đối soát chấp nhận theo đơn vị nào? | SNY/TESO |
| Phân quyền | Vai trò nào được xem, nhập, sửa, xác nhận import, xóa, in và quản lý người dùng; đăng nhập bằng phương thức nào? | SNY/TESO |
| Đính kèm | Ảnh/file gắn PI hay item, loại và dung lượng, nơi lưu, ai có quyền xem/sửa/xóa? | SNY/TESO |
| Môi trường | Cấp DB test/staging độc lập để kiểm import, auth, migration, UAT; localhost hiện dùng chung DB production. | TESO |

Các quyết định chưa có đáp án được ghi là **chưa chốt**, không dùng giá trị mặc định để ghi dữ liệu khách. `workflows/context/handover-2026-10-28.md` cũng cần được bổ sung hoặc xác nhận không có trước khi khóa baseline.

## 5. Tiêu chí nghiệm thu

- **Nguồn và trường:** mỗi file/sheet trong phạm vi có mapping và trạng thái; mỗi trường đề xuất thêm có ví dụ nguồn, nơi hiển thị, người nhập và cách kiểm. Không âm thầm bỏ dòng hoặc tự biến dữ liệu rỗng thành số 0.
- **Liên kết đơn:** test PI một item, nhiều item, mã viết khác, thiếu PI và báo cáo nhiều PI; không tự chọn item khi mơ hồ. Giữ được mã và vị trí nguồn của mọi dòng chưa ghép.
- **Nhập liệu:** nhập tay và Excel cho cùng dữ liệu ra kết quả tương đương; import lặp không nhân đôi; báo cáo sửa không đè ngoài phạm vi được xác nhận; trước khi ghi hiện số dòng nhận, giữ, xung đột và lỗi.
- **Kế hoạch/in:** bản in kéo sợi ngày và dệt tuần/tháng khớp dữ liệu đã chọn, có ngày/kỳ, máy, PI/item và phiên bản; người vận hành SNY duyệt mẫu.
- **Thống kê:** chỉ tiêu nguồn và màn hình khớp ở mức chi tiết lẫn tổng theo kỳ/ngày/máy/đơn/vật tư; bảng dẫn xuất không được nhập thêm như nguồn độc lập; sheet lỗi hoặc ngoài kỳ được báo rõ.
- **Quyền:** mọi trang, 70 route hiện có và route mới được phân loại quyền; gọi API trực tiếp không vượt được quyền trên UI. Kiểm cả trạng thái chưa đăng nhập và thiếu quyền.
- **UAT:** chạy trên DB thử riêng; chưa ghi PASS chỉ vì unit test/build đạt. Khách xác nhận các tình huống sử dụng thực tế trước phát hành.

## 6. Ước lượng và phụ thuộc

Ước lượng sơ bộ cho **một lập trình viên full-stack, BA/QA hỗ trợ**, sau khi nhận đủ đầu vào và chốt phạm vi; không tính thời gian chờ SNY:

| Nhóm việc | Ngày công |
|---|---:|
| M30-01/02: kiểm kê và mapping | 4–6 |
| M30-03…07: mô hình, tab sản lượng, quy cách, nhập và in | 18–28 |
| M30-08: menu thống kê cho dữ liệu tháng 10 được chọn | 8–14 |
| M30-09: đăng nhập và phân quyền | 10–16 |
| M30-10: kiểm thử tích hợp, đối soát, UAT | 6–10 |
| **Tổng tuần tự** | **46–74 ngày công, khoảng 9–15 tuần** |

Nếu cần đưa tất cả sheet lịch sử/lỗi vào menu thống kê, ước lượng tăng thêm khoảng **2–4 tuần** sau khi xác định cách xử lý từng sheet. Hai lập trình viên có thể làm song song các mảng độc lập, nhưng không thể rút ngắn thời gian chờ quyết định nghiệp vụ và UAT theo cùng tỷ lệ.

## 7. Ranh giới thực hiện và kiểm soát rủi ro

- Plan này ghi nhận yêu cầu mới ngày 30/10; không đánh dấu các plan tháng 9 đã được triển khai chỉ vì có mô tả tương tự. Trước mỗi card phải đối chiếu lại code, `REPORT/BACKLOG.md` và bản bàn giao mới nhất.
- Trong lượt lập plan này **không sửa `src/`, schema, DB, `.env`, dữ liệu Excel hoặc cấu hình deploy**. Chưa chọn thư viện auth hay cách lưu file đính kèm khi chưa có ma trận quyền và yêu cầu vận hành.
- Mọi migration/seed/backfill và mọi truy cập DB thật cần scope được duyệt theo `AGENTS.md`; prod/infra/xóa và GitHub có cổng duyệt riêng. Không dùng production để test import hoặc auth.
- Khi tạo card triển khai, mỗi thay đổi phải có phạm vi file, test đúng loại, phương án giữ dữ liệu cũ và rollback. Thay đổi schema, auth hoặc phát hành cần kế hoạch riêng trước khi thực thi.
