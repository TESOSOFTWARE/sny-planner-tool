# Các luồng nghiệp vụ chính

## 1. Nhận đơn, tạo nhiều dòng, bổ sung và duyệt

1. Người dùng nhập PI, khách, thông tin chung như ngày đặt/giao, container, mô tả/remark; thêm ít nhất một dòng hàng. Mỗi dòng có thể khác màu, khổ, GSM, GSM sản xuất, MB code, loại lưới, số kim/dàn, UV/FR, eyelet và yêu cầu đóng gói.
2. Chọn lưu nháp nếu chưa đủ thông số: PI và khách vẫn bắt buộc, ngày đặt được bổ sung mặc định nếu thiếu; thông số còn thiếu được phép null, nhưng thông số đã nhập vẫn phải hợp lệ.
3. Nếu lưu chính thức ngay, phải đủ dữ liệu theo kiểu đơn. Tạo nhiều dòng là một lần lưu trọn vẹn: có lỗi validation thì không tạo một phần các dòng.
4. Với PI đã tồn tại, form nhiều dòng tiếp tục đánh `subLineIndex` sau số lớn nhất hiện có; PI mới từ 0. Cảnh báo khác tên khách trên PI ở form là cảnh báo, không phải ràng buộc chặn tuyệt đối.
5. Sửa một dòng kiểm tra **toàn bộ trạng thái sau sửa** theo chế độ nháp/chính thức rồi tính lại tổng mét, diện tích, trọng lượng và nhu cầu sợi. Đơn chính thức không được sửa thành trạng thái thiếu thông số bắt buộc qua route này.
6. Khi bấm duyệt trên một dòng nháp, hệ thống kiểm tra **tất cả dòng cùng PI**. Chỉ khi tất cả hợp lệ mới bỏ nháp cho toàn PI, tính lại số liệu và chuyển mọi lịch giữ chỗ liên quan thành lịch chính thức. Một dòng chưa đạt làm toàn bộ lần duyệt bị chặn. Gọi duyệt một dòng đã chính thức chỉ trả “đã duyệt”, không tiếp tục duyệt những dòng nháp khác trong PI.
7. Có chức năng sửa hàng loạt thông tin chung cho PI: khách/liên kết khách, ngày đặt/giao, container, mô tả, remark. Không áp một GSM hay màu chung cho mọi dòng bằng chức năng này.

Không thấy luồng trả đơn đã duyệt về nháp, từ chối duyệt hoặc phê duyệt nhiều cấp. Xóa đơn hiện là xóa bản ghi, không phải “hủy đơn” theo một trạng thái có điều kiện.

Nguồn: [form nhiều dòng/API](../../sny-planner-tool/src/app/api/orders/multi-line/route.ts), [validation](../../sny-planner-tool/src/lib/validations/order.ts), [sửa/xóa dòng](../../sny-planner-tool/src/app/api/orders/[id]/route.ts), [duyệt](../../sny-planner-tool/src/app/api/orders/[id]/approve/route.ts), [sửa chung PI](../../sny-planner-tool/src/app/api/orders/bulk-edit-pi/route.ts).

## 2. Nhập đơn từ Excel hoặc dán bảng

1. Đọc dữ liệu và xem trước các dòng, nhận diện theo PI + NO/sub-line; không dùng vị trí hàng trong file làm định danh đơn cũ.
2. NO trống được cấp số còn trống trong nhóm PI của file, tránh đụng các NO đã chỉ rõ. Tuy nhiên nếu PI đã có trong DB mà NO vừa được tự sinh, dòng bị xếp xung đột: người nhập phải ghi NO rõ ràng.
3. Phân loại dòng: `new` → có thể thêm; `identical` → bỏ qua; `conflict` → giữ dữ liệu cũ, báo khác biệt; `invalid` → không nhập. Các dòng cùng khóa nhưng nội dung khác nhau trong file là xung đột. Cùng PI có nhiều khách trong file cũng bị đánh xung đột.
4. Import không tự tạo đơn nháp và không được dùng để duyệt/ghi đè đơn nháp đã tồn tại. Thiếu thông số bắt buộc phải bổ sung trước.
5. Lúc xác nhận, kiểm tra lại dữ liệu hiện tại rồi **chỉ tạo các dòng mới hợp lệ**; dòng lỗi/xung đột bị bỏ qua, không nhất thiết chặn những dòng hợp lệ khác. Tóm tắt trả số tạo/bỏ qua và lý do; “success” không đồng nghĩa mọi dòng đã được nhập.
6. Ghép khách theo tên không phân biệt hoa/thường; chưa có thì tạo hồ sơ cho dòng mới được chấp nhận. Nhiều khách trùng tên sau chuẩn hóa thì không tự chọn.

Nguồn: [phân loại import](../../sny-planner-tool/src/lib/excel/parseOrderList.ts), [confirm Excel](../../sny-planner-tool/src/app/api/orders/import/confirm/route.ts), [bulk paste](../../sny-planner-tool/src/app/api/orders/bulk/route.ts), [test nhận diện dòng](../../sny-planner-tool/src/lib/excel/parseOrderList.test.ts).

## 3. Xếp lịch máy và giữ chỗ

1. Planner chọn **dòng hàng cụ thể**, máy và khoảng ngày; có thể nhập mét phân bổ và sản lượng dự kiến/ngày.
2. Ngày bắt đầu phải không sau ngày kết thúc. Qua luồng gán/sửa thủ công, cùng máy không được giao nhau với lịch hiện có; so sánh bao gồm hai đầu khoảng thời gian.
3. Dòng nháp vẫn được gán: tạo lịch giữ chỗ, chiếm slot như lịch chính thức. Đây là hành vi H2 đã thay quy định F1 cũ “chặn nháp khỏi lịch”.
4. Một dòng đơn được chạy trên nhiều máy. Chưa thấy kiểm tra tổng mét phân bổ có bằng/không vượt tổng đơn, hoặc khổ sản phẩm có phù hợp khổ máy.
5. Duyệt nháp → tất cả lịch của các dòng cùng PI chuyển chính thức. Đổi assignment sang dòng đơn khác → cờ giữ chỗ lấy theo trạng thái nháp của đơn mới.
6. Người dùng có thể đổi máy/ngày/đơn hoặc gỡ lịch. Gỡ lịch cuối cùng làm nhãn tính theo lịch trở lại “Chưa lên lịch”.

Nhập lịch tháng là luồng khác: xem trước lịch sẽ thay, lịch bắt đầu từ tháng trước, PI chưa có hoặc nhiều dòng → xác nhận lựa chọn → kiểm tra preview còn mới → bảo vệ lịch có sản lượng dệt dương → sao lưu phần bị thay → tạo nháp cho PI mới với khách “Chưa xác định (import từ lịch máy)” → tạo assignment và cập nhật khổ máy. PI nhiều dòng không được tự đoán dòng; cần xử lý riêng. Khi lịch mới đụng lịch phải giữ, nó bị bỏ qua và phần lịch cũ liên quan cũng được giữ, kể cả xung đột lan qua nhiều khoảng.

Nguồn: [gán mới](../../sny-planner-tool/src/app/api/assignments/route.ts), [đổi/gỡ lịch](../../sny-planner-tool/src/app/api/assignments/[id]/route.ts), [spec H2](../../sny-planner-tool/docs/specs/h2-draft-schedule-placeholder.md), [confirm lịch tháng](../../sny-planner-tool/src/app/api/schedule/import/confirm/route.ts), [bảo vệ lịch](../../sny-planner-tool/src/lib/schedule/importSafety.ts).

## 4. Trạng thái đơn: tách ba khái niệm

`isDraft` là mức hoàn thiện/duyệt thông tin. `isPlaceholder` là loại lịch giữ chỗ. Badge trạng thái sản xuất lại là kết quả tính từ ngày của các assignment:

| Badge | Điều kiện tính trong code |
|---|---|
| `PENDING` — Chưa lên lịch | Không có assignment |
| `RUNNING` — Đang sản xuất | Có ít nhất một assignment bao phủ mốc hôm nay được hàm tính theo UTC+7 |
| `SCHEDULED` — Đã lên lịch | Không có assignment đang chạy, nhưng còn assignment bắt đầu trong tương lai |
| `DONE` — Hoàn thành | Có assignment và tất cả đã kết thúc trước mốc hôm nay |

Ưu tiên là RUNNING → SCHEDULED → DONE → PENDING. Chuỗi thường gặp: chưa xếp → xếp lịch tương lai → tới ngày chạy → qua ngày cuối. Đây là tính lại theo dữ liệu/thời gian, không phải chuyển trạng thái được ghi nhận bằng thao tác “bắt đầu/hoàn tất”. Sửa hoặc thêm lịch có thể đưa DONE trở lại SCHEDULED/RUNNING; có lịch quá khứ và tương lai nhưng không chạy hôm nay thì SCHEDULED. PO Summary gộp mọi assignment trong PI rồi dùng cùng công thức, nên một dòng chưa xếp có thể không ngăn cả nhóm hiện DONE khi các assignment khác đều hết hạn.

**DONE không chứng minh đã đủ mét, đã đóng gói hoặc đã giao hàng.** Badge cũng không loại placeholder khỏi phép tính. Ngoài ra DB vẫn có trường `status` dạng chuỗi với comment PENDING/IN_PRODUCTION/DONE/CANCELLED; đây là cơ chế khác, chưa thấy workflow đồng bộ nó với badge. Dropdown lịch còn lọc theo `status != DONE` trong DB.

Nguồn: [hàm badge](../../sny-planner-tool/src/lib/orderStatus.ts), [gộp PI](../../sny-planner-tool/src/components/orders/POSummaryTable.tsx), [lọc đơn để gán](../../sny-planner-tool/src/app/schedule/actions.ts), [schema](../../sny-planner-tool/prisma/schema.prisma).

## 5. Ghi nhận sản xuất và theo dõi tiến độ

1. Nhập báo cáo công đoạn → xem trước → xác nhận. Kéo sợi/mắc sợi/dệt chi tiết lưu máy, ngày, ca D/N, màu, kg và các thông số; kg bằng 0 hợp lệ.
2. Khi nhập lại ba loại báo cáo chi tiết này, thay nhóm bản ghi **máy + ngày có trong lần nhập**, không cộng thêm toàn bộ lần nhập vào lịch sử. Các liên kết đơn cũ được giữ nếu nhận diện được dòng; mất dòng đã liên kết hoặc ghép nhiều dòng mơ hồ thì chặn, không chọn theo thứ tự hàng.
3. Dòng mới chỉ tự liên kết khi PI khớp duy nhất một dòng đơn theo chuẩn hóa của hàm matching. PI nhiều dòng hoặc không khớp để `orderId = null`, vẫn giữ `orderRef` gốc. Hiện hàm dùng trim/hoa thường; không nên giả định có ghép gần đúng theo tên màu hay tên sản phẩm như một số tài liệu cũ mô tả.
4. Báo cáo tổng dệt nhập trực tiếp mét ngày từ dòng TOTAL, cập nhật theo máy/ngày; giá trị âm được chặn dưới về 0 khi lưu. Không tính hiệu giữa hai ngày. `cumulativeMeters` hiện lưu cùng giá trị để tương thích, không còn mang ý nghĩa cộng dồn như comment schema cũ.
5. Tiến độ một đơn = tổng `dailyMeters` trên máy được gán, trong khoảng ngày lịch theo ngày Việt Nam, tối đa đến hôm nay. Cùng máy/ngày chỉ cộng một lần **trong một đơn** dù assignment của đơn đó chồng nhau. Đơn nháp/thiếu chiều dài không có tiến độ hữu ích; không có lịch thì không có dữ liệu tiến độ.
6. Mét còn lại = `max(0, tổng mét đơn − mét đã sản xuất)`. Năng suất trung bình lấy các bản ghi máy/ngày có mét > 0, nằm trong lịch đơn, từ hôm nay trừ 7 ngày tới hôm nay (hai đầu đều được lấy). Ngày còn lại = làm tròn lên mét còn / trung bình; không có trung bình thì để trống.
7. Hành trình kéo/mắc trên PI cộng kg của báo cáo có liên kết đơn, chia tổng nhu cầu sợi của những dòng không nháp; phần trăm hiển thị chặn tối đa 100%, kg thực vẫn được giữ. Có cơ chế cảnh báo dữ liệu chưa liên kết, nhưng không phải mọi cách viết PI sai đều được phát hiện.

Không có bằng chứng rằng nhập sản lượng sẽ tự trừ kho, tự thay ngày kết thúc lịch, hoặc tự ghi `status = DONE`. `estimatedDailyOutput` của planner vẫn là thông tin nhập tay, không phải nguồn tính ngày còn lại ở luồng trên.

Nguồn: [bảo toàn liên kết](../../sny-planner-tool/src/lib/excel/preserveOrderLinks.ts), [import kéo sợi](../../sny-planner-tool/src/app/api/extruder/import/confirm/route.ts), [import mắc sợi](../../sny-planner-tool/src/app/api/warping/import/confirm/route.ts), [import dệt chi tiết](../../sny-planner-tool/src/app/api/knitting/detail/import/confirm/route.ts), [import tổng dệt](../../sny-planner-tool/src/app/api/knitting/import/confirm/route.ts), [tính tiến độ](../../sny-planner-tool/src/app/api/knitting/progress/[orderId]/route.ts), [journey](../../sny-planner-tool/src/app/api/orders/journey-summary/route.ts).

## 6. Quản lý tồn và nhập báo cáo nguyên liệu

1. Tạo nguyên liệu, nhập tồn đầu hiện tại và ngưỡng nếu có; đơn vị mặc định kg. Tồn đặt trực tiếp và ngưỡng không được âm.
2. Giao dịch thủ công có số kg > 0: `in` cộng tồn; `out_using`, `out_broken`, `out_tape`, `out_reject` trừ tồn. Tạo giao dịch và đổi tồn cùng một lần lưu. Hiện không thấy điều kiện chặn số xuất vượt tồn.
3. Xóa một giao dịch thủ công hợp lệ đảo lại tác động tồn: xóa nhập làm giảm tồn, xóa xuất làm tăng tồn.
4. Nhập báo cáo: chọn nhóm HDPE/MB/KOREA, ngày và block nếu file có nhiều block → xem trước → xác nhận các vật tư cần thay số liệu. Ghép theo nhóm + tên chuẩn hóa; trùng tên mơ hồ không tự gộp. Vật tư mới được tạo với ngưỡng chưa đặt.
5. Báo cáo chốt **LAST STOCK là tồn có thẩm quyền**; lưu snapshot tồn đầu/nhập/xuất/tồn cuối và tạo các giao dịch khác 0 tương ứng. Không cộng các movement thêm lần nữa lên LAST STOCK, không thấy cưỡng chế LAST STOCK phải bằng tồn đầu + nhập − xuất.
6. Báo cáo y hệt ở snapshot hiện hành là không đổi dữ liệu; báo cáo cũ hơn mốc tồn hoặc giao dịch mới nhất bị chặn. Dữ liệu thay đổi sau preview phải xem lại. Vật tư đã có và cần cập nhật được phân loại `replace`, phải xác nhận đúng tập vật tư — không chỉ trường hợp sửa cùng ngày.
7. Sửa snapshot cùng ngày thay các movement thuộc đúng snapshot đó và tăng phiên bản. Nếu tồn đã bị tác động thủ công sau snapshot, không cho thay lại snapshot đó bằng số liệu khác; dùng báo cáo ngày mới theo các điều kiện kiểm tra.
8. Sau khi có mốc báo cáo, không thêm giao dịch thủ công có ngày <= mốc; không xóa movement thuộc snapshot hoặc giao dịch đã được snapshot bao phủ. Sửa tồn trực tiếp vẫn được cho phép nhưng đánh dấu tồn đã thay thủ công. Không đổi nhóm hoặc xóa vật tư đã có snapshot.
9. Cảnh báo thiếu tồn khi `currentStock < minThreshold`; bằng ngưỡng chưa cảnh báo, ngưỡng null hiển thị “Chưa đặt ngưỡng”. Đây là cảnh báo theo tồn/ngưỡng, chưa phải tính thiếu vật tư từ tổng đơn đã lên kế hoạch.

Nguồn: [vật tư](../../sny-planner-tool/src/app/api/materials/route.ts), [sửa/xóa vật tư](../../sny-planner-tool/src/app/api/materials/[id]/route.ts), [nhập/xuất](../../sny-planner-tool/src/app/api/materials/[id]/transactions/route.ts), [xóa giao dịch](../../sny-planner-tool/src/app/api/materials/[id]/transactions/[txId]/route.ts), [confirm snapshot](../../sny-planner-tool/src/app/api/materials/import-transactions/confirm/route.ts), [badge tồn](../../sny-planner-tool/src/components/materials/MaterialsTable.tsx).

## 7. Rolling và đóng gói

1. Rolling: đọc sheet theo block ngày và lưu các chỉ số số lượng/mét/kg theo nhãn gốc DAY/NIGHT hoặc SMALL/BIG, bỏ phần tổng cộng để tránh cộng hai lần trong cùng block. Chỉ số được parser lấy khi > 0.
2. Nhãn ngày gộp như `04+05th` được gán toàn bộ vào ngày đầu; tháng/năm lấy từ tên file. Đây là hạn chế biểu diễn của luồng hiện tại, không phải bằng chứng cả sản lượng được làm vào ngày đầu.
3. Ghép PI Rolling chỉ khi có một dòng đơn duy nhất. **Confirm hiện chèn thêm bản ghi**, không có khóa chống trùng/replace theo ngày; nhập lại cùng file có nguy cơ tăng trùng số liệu.
4. Đóng gói: đọc ngày thật trong dòng → tạo snapshot sáu giá trị ca ngày/đêm. Null khác 0; số lượng phải là số nguyên không âm, mét/kg không âm.
5. Ngày mới → thêm; cùng ngày và sáu giá trị giống → giữ; cùng ngày khác → phải xác nhận thay toàn bộ snapshot ngày đó. Dữ liệu đổi sau preview thì xem lại; ngày không có trong file mới vẫn giữ nguyên. Đổi tên file không tạo ngày mới.
6. Đóng gói là tổng toàn xưởng, chưa thể suy ra PI nào đã đóng gói xong. Cờ `requiresPacking` trên dòng đơn chưa tạo ra điều kiện khóa/mở một công đoạn đóng gói theo đơn.

Nguồn: [parser Rolling](../../sny-planner-tool/src/lib/excel/parseRollingReport.ts), [confirm Rolling](../../sny-planner-tool/src/app/api/materials/rolling/import/confirm/route.ts), [confirm đóng gói](../../sny-planner-tool/src/app/api/materials/packing/import/confirm/route.ts), [test đóng gói](../../sny-planner-tool/src/lib/excel/parsePackingReport.test.ts).
