# 03 — Báo cáo các bộ phận và độ đúng dữ liệu

## Mục tiêu nghiệm thu

Theo ảnh chat Hongloan: số liệu báo cáo của tất cả bộ phận phải vào hệ thống, khớp nguồn và đủ để planner lập kế hoạch. Cần đối soát chi tiết và tổng; hai sai lệch bù nhau có thể làm tổng đúng dù chi tiết sai.

## Nguồn dữ liệu cần bao phủ

| Nhóm | Nguồn bàn giao | Điều cần giữ đúng |
|---|---|---|
| Đơn hàng | ORDER LIST OFFICIAL 2023-2026; PDF PO | PI/sub-line, khách, màu, quy cách, qty, mét, GSM và yêu cầu riêng |
| Lịch máy | Production schedule 1 2026, 11 sheet | Các revision, khoảng ngày, máy, PI, lịch có sản lượng thật |
| Thông số/lệnh sản xuất | CC2018, 440 sheet; Formular; Extruder 2023/2024/2025 | Khổ, sợi, denier, beam, dàn, màu, hệ số và chỉ dẫn theo lệnh |
| Kéo sợi | STATISTICAL: EXTRUDER; CHỈ KÉO SỢI tháng 4/5; SẢN LƯỢNG KÉO SỢI | Máy/ngày/ca, kg, màu, PI thô, thông số; phân biệt kế hoạch và thực tế |
| Mắc sợi | STATISTICAL: WARPING | Strand, beam, mét/ea, cân nặng, số lượng và kg thuần |
| Dệt | STATISTICAL: KNITTING; Template_Knitting_Report | Tổng mét máy/ngày và chi tiết ca/đơn là hai cấp dữ liệu khác nhau |
| Cuộn | STATISTICAL: ROLLING | Quantity, mét, kg theo nhãn DAY/NIGHT hoặc SMALL/BIG |
| Đóng gói | STATISTICAL: SẢN LƯỢNG ĐÓNG GÓI | Số lượng/mét/kg ca ngày và ca đêm; dữ liệu hiện được lưu tổng xưởng |
| Kho và chỉ tape | STATISTICAL: HDPE, HDPE KO SỬ DỤNG, HONSIN, TRAN KHANG, ITM, TỒN CHỈ TAPE tùy kỳ | Tồn đầu, nhập, từng loại xuất, tồn cuối và kỳ; không bỏ sheet vì chưa có parser |
| MB/FR và mua nguyên liệu | kế hoạch đặt MB 2025 | Nhu cầu, tồn, lượng cần đặt, đặt/nhận thực; không suy thành quy trình mua hàng đã có trong web |
| Tổng hợp | % DỆT, %LINE, CHART và các sheet phụ | Xác định chỉ tiêu dẫn xuất và công thức trước khi bỏ qua hoặc nhập; tránh đếm trùng với dữ liệu gốc |

Danh sách đầy đủ theo file/sheet nằm ở [phạm vi nguồn](business-logic-source-coverage.md) và [inventory](../../../plans/SNY_FILE_INVENTORY_2026-09-19.md). Hai tháng thống kê có cấu trúc khác nhau; không dùng một danh sách sheet cố định rồi bỏ qua phần còn lại.

## Hành vi import đã đọc trong source

- Đơn: nhận diện PI + NO; chia new/identical/conflict/invalid; chỉ tạo dòng mới hợp lệ, không tự ghi đè xung đột hay duyệt nháp. NO tự sinh khi PI đã tồn tại cần xử lý rõ.
- Kéo sợi/mắc sợi/dệt chi tiết: thay nhóm máy/ngày được nhập; giữ liên kết đơn cũ khi nhận diện được. PI nhiều dòng không được tự chọn theo thứ tự.
- Tổng dệt: lưu mét ngày theo máy/ngày; không tính delta từ `cumulativeMeters`.
- Rolling: code confirm được đọc đang append; nhập lặp có nguy cơ nhân đôi. Nhãn ngày gộp được gán ngày đầu — cần ghi rõ hạn chế đối soát.
- Packing: so snapshot ngày; giống thì giữ, khác thì xác nhận thay; đổi tên file không tạo ngày mới. Chưa có liên kết đóng gói theo PI.
- Vật tư: LAST STOCK làm mốc tồn; snapshot giữ tồn đầu/nhập/xuất/cuối và revision. Không cộng movement lần nữa vào LAST STOCK. Có kiểm tra dữ liệu đổi sau preview và báo cáo lùi ngày.

Nguồn code/điều kiện chi tiết: [workflow](business-logic-workflows.md). Đây là kết quả đọc local, chưa xác nhận dữ liệu production hay UAT.

## Warping và Rolling: bằng chứng đến đâu, kết luận đến đó

`STATISTICAL REPORT 04-2026`, `WARPING!L8=K8×(I8−J8)`: 14 × (35,5 − 13,5) = 308 kg. Công thức chứng minh J là lượng cân nặng bị trừ trên mỗi đơn vị; đối chiếu header CC2018 hỗ trợ mạnh cách hiểu kg bì beam. G có các giá trị 16/19, phù hợp giả thuyết loại/spec beam trong CC2018; riêng công thức L8 không chứng minh ý nghĩa G. Giữ nhãn nguồn và ghi đây là suy luận khi đề xuất đổi `beamCount1`; không tự migrate chỉ dựa vào tên trùng.

SMALL/BIG có quantity/mét/kg riêng và tổng cộng theo công thức nguồn. Có thể bảo toàn nhãn và đối soát mà chưa Việt hóa. Chưa có bằng chứng đủ để gọi chúng là kích thước lõi, ca làm hay loại máy.

## Những sai lệch có ảnh hưởng trực tiếp tới kế hoạch

1. Badge DONE do hết lịch, khác hoàn thành sản lượng/đóng gói/giao hàng.
2. Tổng dệt máy/ngày được quy về đơn theo assignment; một máy/ngày phục vụ nhiều đơn có nguy cơ quy trùng giữa các đơn.
3. Lịch bị xóa/thay có thể làm mất căn cứ tính tiến độ dù báo cáo sản lượng vẫn còn. Sự cố CVellis26-2 trong bàn giao là ví dụ cần giữ khi kiểm thử hồi quy.
4. Dòng chưa nối được đơn phải hiện rõ; không coi là không có sản lượng và không tự gán cho sub-line đầu tiên.
5. Công thức Excel có lỗi hoặc cached value cũ: đọc được số chưa chứng minh số nguồn đúng. Audit đã ghi ví dụ `HDPE KO SỬ DỤNG!U5` tháng 5 có `#REF!` và giá trị cache.

## Cách đối soát

Lập bảng file/sheet/chỉ tiêu → parser → trường lưu → màn hình planner. Với từng kỳ: kiểm số dòng nhận/bỏ/lỗi; so giá trị theo ngày, ca, máy, đơn, vật tư; so tổng đúng đơn vị; thử nhập lặp, file sửa cùng kỳ và file đổi tên. Lưu bằng chứng chênh lệch tới dòng/ô cụ thể.

Quy tắc nhận báo cáo sửa phải xét theo từng luồng đang có; không hỏi lại chung rằng hệ thống chưa có hành vi nào. Phần cần chốt thêm là hành vi mong muốn ở chỗ thiếu hoặc khác nhu cầu khách, đặc biệt Rolling. Kỳ nghiệm thu và người xác nhận đủ dùng cho kế hoạch chưa được coi là đã chốt.

Nguồn: [dữ liệu gốc](<../../../User Raw Documents/>), [mâu thuẫn bàn giao](../../../tailieubangiao/CONFLICTS_AND_GAPS.md), [audit cũ](../../../plans/SNY_FULL_AUDIT_2026-09-19.md).
