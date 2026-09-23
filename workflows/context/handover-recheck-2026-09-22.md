# Rà soát lại toàn bộ tài liệu bàn giao — 22/09/2026

Mục đích của lượt này là kiểm tra lại nguồn gốc trước khi đặt câu hỏi nghiệp vụ. Tài liệu tổng hợp cũ, plan cũ và comment trong code không được dùng làm bằng chứng cuối cùng nếu workbook/PO gốc có câu trả lời khác.

## Phạm vi đã kiểm tra

- Toàn bộ file hiện có trong `Sofware Develoment`, `tailieubangiao`, `Tổng hợp thông tin dự án`, `plans` và `User Raw Documents`.
- 6 tài liệu Word/PowerPoint nghiệp vụ, 4 PDF PO và toàn bộ Markdown bàn giao/tổng hợp.
- 14 workbook gốc: 629 sheet, 2.875.311 ô có dữ liệu được trích, 1.211.858 ô công thức được lập chỉ mục. Việc này bảo đảm tìm kiếm được trên mọi sheet; không có nghĩa từng ô trong 2,8 triệu ô đã được một người đọc thủ công.
- Các vùng có ảnh hưởng đến bốn điểm đang tranh luận được đọc lại ở cấp ô/công thức và đối chiếu với source hiện tại.
- Không có file nguồn nào mới hơn bộ trích xuất ngày 21/09/2026. Không ghi DB, không import, không sửa source.

## Kết luận sau khi đối chiếu nguồn gốc

| Vấn đề từng bị ghi là “chưa rõ” | Bằng chứng gốc | Kết luận dùng cho plan |
|---|---|---|
| Cơ sở MB 3% | `EXTRUDER 2024 + extruder 2025 O.xlsx`, nhiều dòng như `9.2024!J1015:K1015` ghi `MÀU *3%` và `100KG NHỰA =3KG MÀU`. Cùng file có 3,5% và 3,7%; CC2018 có ghi chú `tape : 3~3.5% MB + mono : 1% mb` | Phần trăm MB là tỷ lệ khối lượng màu trên khối lượng nhựa của mẻ/thành phần tương ứng. Không được hard-code 3% toàn nhà máy; tỷ lệ thuộc công thức/chỉ dẫn của sản phẩm hoặc lệnh kéo sợi |
| Phân bổ nhiều màu | `kế hoạch đặt MB 2025.xlsx`, `MB Korea 20.5.2025!D86:D88` và các cột đơn khác: khối lượng kế hoạch × loss 1,1, chia theo tổng trọng số cấu hình rồi nhân tổng trọng số của từng mã màu và tỷ lệ 4%. Ví dụ ba mã 3160-2, 3233-5, 8005A dùng các nhóm trọng số khác nhau | Workbook đã cung cấp cách phân bổ theo trọng số thành phần của từng công thức. Cần lưu/cấp trọng số theo recipe; không chia đều màu và không cần hỏi lại “các màu có dùng đồng thời không” đối với ví dụ đã có công thức |
| Input Work Order | `Formular.xlsx!B4` ghi đủ `khổ cm × loss trên kim × số kim sử dụng × số khổ dệt / 2,54 / số beam`; `EXTRUDER 2023!Sheet2` giải thích cùng công thức; `Sheet4` có cột Khổ rộng, Tỷ lệ loss, Kim, Khổ, Số Beam, Số Sợi | Mapping nghiệp vụ của công thức đã rõ. `needleCount` hiện tại có thể cung cấp số kim; `beamCount` hiện tại đang mang nghĩa “Số dàn”, không được dùng thay “Số beam sử dụng”. Cần thêm input riêng cho số khổ dệt và số beam dùng |
| Làm tròn Work Order | `Formular.xlsx!B2` ghi 8.482,142857… thành `8482m`; `B4` ghi 141,732283… thành `142 sợi`. `EXTRUDER 2023!Sheet2` cũng ghi 124,606299… thành `125s` | Các ví dụ nhất quán với làm tròn kết quả vận hành tới số nguyên gần nhất, trong khi vẫn nên giữ raw value để đối soát. Chưa thấy ví dụ đúng điểm `.5`; áp quy tắc half-up cho số dương nếu triển khai và khóa bằng test |
| Heating | PO `IWN26-161` ghi `HEAT TREATED`; ảnh nghiệp vụ ghi `With heating machine`. Không tìm thấy công thức nào trong 629 sheet dùng cờ heating làm toán hạng | Heating là yêu cầu/chỉ dẫn sản xuất và chất lượng. Lưu, hiển thị và in ra Work Order; không làm thay đổi phép tính khi không có công thức nguồn |
| Hai cột BEAM của Warping | `STATISTICAL REPORT 04-2026`, `WARPING!G7:L8`: `L8=K8*(I8-J8)`. G=16, I=35,5, J=13,5, K=14 cho L=308. Trong CC2018, header Work Order tách `Số beam sử dụng`, `Loại beam`, `Số kg beam+chỉ`, `Số kg beam` | Cột G là loại/spec beam (dù header báo cáo chỉ ghi BEAM); cột J là kg bì beam/beam rỗng được trừ khỏi kg beam+chỉ; K là số lượng. Tên `beamCount1/beamCount2` trong code là sai ngữ nghĩa và cần đổi ở plan |
| Rolling SMALL/BIG | `STATISTICAL REPORT`, sheet `ROLLING ` có nhóm `QUANTITY/TOTAL(M)/WEIGHT SMALL/BIG`; công thức tính từng nhóm rồi cộng tổng. Không có glossary nào trong toàn bộ hồ sơ giải nghĩa chữ SMALL/BIG | Hệ thống có thể và nên nhập/hiển thị đúng nhãn nguồn, đơn vị và công thức mà không cần biết tên Việt hóa. Chỉ cần hỏi SNY nếu muốn đổi nhãn/chuẩn hóa SMALL/BIG sang một khái niệm khác; đây không phải blocker của import/đối soát hiện tại |

## Những điểm thực sự chưa được nguồn bàn giao trả lời

1. A/B của DESERT SAND được planner chọn thủ công hay có điều kiện tự chọn. Không có nguồn nào quy định thuật toán tự chọn; phương án an toàn trong plan là chọn thủ công, không suy từ tồn kho/GSM.
2. Recipe thuộc phạm vi khách hàng + sản phẩm hay dùng chung, và khi sửa recipe thì đơn cũ giữ snapshot/version nào. Đây là quyết định về quản trị dữ liệu chưa có trong hồ sơ, không phải thiếu công thức.
3. Bảng điều kiện tổng quát để chọn loss 1,05/1,1/1,2 và hệ số phụ trội cuối 1,1 cho mọi loại đơn. Workbook cho biết chính xác từng ví dụ/dòng nhưng không có decision table chung. Có thể số hóa theo recipe/dòng đã biết; không được biến một mẫu thành mặc định toàn nhà máy.
4. Ý nghĩa từ vựng nội bộ chính xác của SMALL/BIG. Điều này chỉ chặn việc đổi tên hoặc suy thêm nghiệp vụ, không chặn việc bảo toàn dữ liệu nguồn.
5. Quy tắc xử lý khi báo cáo cùng bộ phận/cùng ngày được gửi lại sau khi sửa: thay thế, cộng bổ sung hay lưu revision. Cần chốt riêng theo từng loại báo cáo nếu code phải thay đổi hành vi import.
6. Tiêu chí nghiệm thu end-to-end cho yêu cầu “báo cáo tất cả bộ phận”: kỳ/file chuẩn, danh sách chỉ tiêu planner dùng và người xác nhận. Danh sách sheet có trong file đã rõ; tiêu chí ký nhận sử dụng thực tế chưa có.

## Nguyên tắc chống lặp lại sai sót

Trước khi thêm câu hỏi khách hàng vào plan phải ghi đủ: file → sheet → ô/dòng → kết quả tìm kiếm trong toàn bộ workbook liên quan → lý do bằng chứng vẫn chưa trả lời. Câu hỏi không có chuỗi bằng chứng này chỉ được ghi là giả thuyết nội bộ, không được đưa cho khách. Mọi câu hỏi đã được nguồn gốc trả lời phải chuyển thành rule/assumption có trích dẫn, không giữ lại để “hỏi cho chắc”.
