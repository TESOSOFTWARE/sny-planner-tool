# Nghiệp vụ từ tài liệu gốc, Excel, PO và các mâu thuẫn nguồn

## Phạm vi sản phẩm và quy trình ngoài phần mềm

Project brief đặt hai giai đoạn: khảo sát/chuẩn hóa và làm phiên bản đầu; sau đó hoàn thiện/tự động hóa dựa trên yêu cầu được nghiệm thu. SRS ngày 12/07/2026 liệt kê 31 yêu cầu cấp cao; tự xếp lịch, dự báo thiếu nguyên liệu, chat AI và phân quyền Admin/Planner/Viewer thuộc phần sau. Hai bản slide mô tả tầm nhìn rộng hơn, gồm BOM, lao động, mô phỏng thay đổi và AI đề xuất kế hoạch; các slide này không chứng minh những chức năng đó đã tồn tại. Mốc go-live trong kế hoạch là mục tiêu lịch, chưa phải bằng chứng đã nghiệm thu.

Quy trình thực tế được các nguồn mô tả:

1. Nhận PO/PI từ khách, đọc từng dòng hàng cùng yêu cầu UV/FR, màu, kích thước, chất lượng, đóng gói và hạn giao. Một PI có thể chứa nhiều GSM/màu/quy cách.
2. Planner chuẩn bị thông số sản xuất và nhu cầu sợi; Excel có thêm bài toán beam, số sợi, chia màu/dàn và kế hoạch mua MB/FR. Phần mềm hiện thực hiện công thức đơn hàng, chưa bao phủ toàn bộ các phép tính Excel dưới đây.
3. Planner quyết định máy và thời gian; file lịch giữ nhiều phiên bản ngày sửa. Thay đổi lịch phải giữ khả năng quy sản lượng lịch sử về đơn đã sản xuất.
4. Xưởng ghi nhận kéo sợi → mắc sợi → dệt → Rolling → đóng gói; thống kê chuyển số liệu vào báo cáo. Các tab phần mềm nhận dữ liệu theo công đoạn, không cưỡng chế một chuỗi phê duyệt nối tiếp.
5. Thủ kho/theo dõi vật tư đối chiếu tồn, nhập, xuất; planner dùng thêm Excel nhu cầu và đơn mua. Việc có cột “số lượng đặt”, “nhận hàng”, “còn lại” trong Excel không có nghĩa phần mềm đã có quy trình đặt mua/duyệt mua hàng.
6. Planner và lãnh đạo theo dõi tiến độ, xử lý chênh lệch và kế hoạch tiếp theo. Điều kiện nghiệm thu chất lượng, xuất hàng, chứng từ và thanh toán có trong PO nhưng chưa thành workflow thương mại trong code đã đọc.

Nguồn: [Project brief](<../../Sofware Develoment/SNY Planner tool Project brief.docx>), [SRS](<../../Sofware Develoment/SNY_Planner_Tool_SRS_v1.0.docx>), [slide 11 trang](<../../Sofware Develoment/SNY_Planner_Tool_Demo_EN_icons.pptx>), [slide 9 trang](<../../Sofware Develoment/SNY_Planner_Tool_Demo_EN_icons(1).pptx>), [Blueprint](<../../tailieubangiao/SNY_PLANNER_BLUEPRINT.md.docx>).

## Công thức đã được cung cấp, chưa đồng nghĩa đã được code hóa

Trong [Formular.xlsx](<../../User Raw Documents/Formular.xlsx>), `Sheet1!A2:B4` ghi công thức bằng **văn bản**, nên thống kê không có ô Excel formula không có nghĩa không có công thức nghiệp vụ:

| Đại lượng | Công thức và ví dụ gốc |
|---|---|
| Mét sợi trên beam | `kg × 9.000.000 / số sợi / denier`; 38 kg, 144 sợi, 280D cho khoảng 8.482,14 m; tài liệu ghi 8.482 m |
| Kg sợi trên beam | `mét × số sợi × denier / 9.000.000`; 8.500 m × 144 × 280 / 9.000.000 = 38,08 kg |
| Số sợi trên beam | `khổ cm × hệ số loss trên kim × mật độ kim/inch × số khổ dệt / 2,54 / số beam`; 300 × 1,05 × 8 × 2 / 2,54 / 14 ≈ 141,73, ví dụ ghi 142 sợi |

“8 kim” trong ví dụ là 8 kim trên một inch, không phải tổng số kim của máy. `EXTRUDER 2023`, Sheet2/Sheet4 còn đặt tên đủ các input: Khổ rộng, Tỷ lệ loss, Kim, Khổ, Số Beam và Số Sợi. Các ví dụ nguồn nhất quán với làm tròn số nguyên gần nhất: 8.482,142… → 8.482 m; 141,732… → 142 sợi; 124,606… → 125 sợi. Raw value vẫn phải được giữ để đối soát. Field `ProductionOrder.beamCount` trong code mang nghĩa Số dàn, nên không được dùng thay Số beam sử dụng. Không lấy công thức beam giả lập của source demo cũ thay cho nguồn này.

Trong workbook [kế hoạch đặt MB 2025](<../../User Raw Documents/kế hoạch đặt MB 2025.xlsx>):

- Sheet `tính % MB `, dòng 5: `G5=C5×D5×E5×F5/1000` (khổ × dài × GSM × số cuộn), `H5=G5`, `I5=H5×1,05`, `M5=I5×L5/100×1,1`. Với STRNGM 25-1: 10.425,998 kg hàng → 10.947,2979 kg sau loss → 96,33622152 kg MB ở tỷ lệ 0,8% và hệ số cuối 1,1.
- Ngay trong cùng sheet, `I8=H8×1,1`, `I14=H14×1,2`; dòng 14 chia phần khối lượng theo `/(1+2)×2`, dòng 15 lấy một nửa dòng 14. Sheet `MB Korea 20.5.2025`, các dòng 86–88 còn phân bổ trực tiếp ba mã 3160-2, 3233-5 và 8005A theo tổng trọng số recipe rồi nhân tỷ lệ 4%. Đây là bằng chứng cách chia nhiều màu đã tồn tại theo từng recipe; phần chưa có chỉ là decision table chung để tự chọn hệ số cho mọi sản phẩm.
- Sheet `tính FR`, `M9=I9×L9/100×1,1` với FR01 6,5%; nhưng `M15=I15×L15/100` với FR01 7% không có hệ số cuối 1,1. Tên sheet không bảo đảm mọi dòng đều là FR: đầu sheet còn có dòng MB màu.
- Các sheet mua MB có tổng đặt, tổng nhận và chênh lệch bằng SUMIFS theo nhãn. Số mua thực còn có các giá trị nhập tay; chưa đủ căn cứ kết luận một rule duy nhất về làm tròn lô mua, trừ tồn hay MOQ.

Các tỷ lệ trong Excel không thể gom thành “toàn nhà máy loss 5%”. Ví dụ [EXTRUDER 2023](<../../User Raw Documents/EXTRUDER 2023.xlsx>) `Sheet3!H3=G3×1,045`. Trong [SẢN LƯỢNG KÉO SỢI](<../../User Raw Documents/SẢN LƯỢNG KÉO SỢI.xlsx>), `KEO SOI 9.2018!M3` ghi loss 4,5% nhưng `M4=K4×1,035`. Đây là mâu thuẫn giữa nhãn và công thức cần xác nhận, không tự sửa hoặc coi một phía luôn đúng. `THEO DÕI UV, FR!N1` còn ghi “UV ĐƠN HÀNG CẦN LOSS 1.5%”; chưa rõ điều kiện và cách áp dụng.

Trong [EXTRUDER 2024 + extruder 2025 O](<../../User Raw Documents/EXTRUDER 2024 + extruder 2025 O.xlsx>), các lệnh ghi thẳng `MÀU *3%`/`100KG NHỰA =3KG MÀU`; các lệnh khác ghi 3,5% hoặc 3,7%. Do đó `MB Rate 3%` có cơ sở khối lượng rõ ràng là kg màu trên 100 kg nhựa của mẻ/thành phần liên quan, nhưng tỷ lệ phải đi theo recipe/lệnh, không phải hằng số toàn nhà máy.

**Phân biệt ba khái niệm:** hao hụt tính nhu cầu kg sợi, loss trên kim dùng tính số sợi/khổ, và dung sai hợp đồng của thành phẩm. Chúng có nguồn, đơn vị và mục đích khác nhau.

## Ngữ nghĩa báo cáo đã xác định từ công thức nguồn

- Warping: trong `STATISTICAL REPORT 04-2026`, `WARPING!G7:L8`, cột G mang loại/spec beam; cột J là kg bì beam và `L8=K8×(I8−J8)`. Đối chiếu CC2018 cho thấy Work Order có các cột riêng `Số beam sử dụng`, `Loại beam`, `Số kg beam+chỉ`, `Số kg beam`. Vì vậy tên code `beamCount1/beamCount2` là placeholder sai nghĩa, không còn là câu hỏi chưa có bằng chứng.
- Rolling: sheet `ROLLING ` lặp các nhóm `QUANTITY`, `TOTAL(M)`, `WEIGHT` theo DAY/NIGHT hoặc SMALL/BIG và tính từng nhóm trước khi cộng tổng. Hồ sơ không có glossary giải nghĩa chữ SMALL/BIG, nhưng điều đó không chặn việc bảo toàn nhãn, nhập số và đối soát đúng công thức nguồn.
- Heating: PO IWN26-161 ghi `HEAT TREATED`, bảng recipe ghi `With heating machine`; không có công thức nào trong 629 sheet dùng heating làm toán hạng. Đây là chỉ dẫn sản xuất/yêu cầu chất lượng, không phải hệ số tính toán theo bằng chứng hiện có.

## Điều kiện thao tác xưởng và dữ liệu ngoại lệ

Trong [CC2018 ok.xlsb](<../../User Raw Documents/CC2018 ok.xlsb>):

- `NO2 KSSNY BLACK2.45+3.65 3.05!B4` ghi lưới shade net 70% chỉ được nối chỉ dàn trước; `C6` hướng dẫn nếu dàn sau thiếu chỉ thì thêm/bớt sợi để chuyển beam sang dàn khác và dùng beam không nối chỉ cho dàn đó.
- `PRIME 18!C7` lại hướng dẫn xử lý với **dàn trước không được nối chỉ**. Cần xác nhận loại sản phẩm/cấu hình ứng với mỗi hướng dẫn; không khái quát rule của một sheet sang toàn xưởng.
- Các ô tiêu đề có loss khác nhau: `NO.13 KTQ + IWN 18-120!F1` 6%, `SODEX!E1` 3%, `NO.17 IWN089 BLUE3.3X75X50!F1` 5%, cùng nhiều biến thể khác. Chưa có bảng chọn loss đã chuẩn hóa trong source hiện tại.

Trong [EXTRUDER 2024 + extruder 2025 O](<../../User Raw Documents/EXTRUDER 2024 + extruder 2025 O.xlsx>), ghi chú `11.2024!D257` chỉ định màu/chỉ/UV và lượng chạy khi vệ sinh máy; `6.2025!J5010` ghi trường hợp kéo nhầm màu/quy cách. Các ghi chú cho thấy trình tự chạy, vệ sinh và chất lượng có ý nghĩa nghiệp vụ, nhưng chưa thành điều kiện tự xếp lịch trong code.

Báo cáo gốc có cả công thức lỗi/tham chiếu hỏng lẫn cached value: ví dụ `STATISTICAL REPORT 05-2026.xlsx`, `HDPE KO SỬ DỤNG!U5` có formula `#REF!` nhưng cached value 23. Vì vậy số đọc được từ file chưa chứng minh phép tính nguồn còn hợp lệ. Chưa tính lại workbook, chưa sửa dữ liệu và chưa chứng nhận độ chính xác của toàn bộ số liệu lịch sử.

## Điều kiện riêng của PO mẫu

Đã đọc cả văn bản và ảnh trang PDF vì một số bảng hàng là ảnh, còn lớp text chứa chữ cũ chồng lên ngày giao. Dùng nội dung nhìn thấy trên trang cho các ví dụ sau:

| PO | Yêu cầu nhìn thấy trên chứng từ | Ý nghĩa đối với việc hiểu hệ thống |
|---|---|---|
| [CVellis26-2](<../../User Raw Documents/Order samples/PO_SNY-CVellis26-2 (2026.07.01) - chop.pdf>) | 450 cuộn × 100 m, khổ 3 m, 75 GSM, Blue; dung sai lượng ±10%, trọng lượng/kích thước ±3%; giao giữa tháng 8/2026; điều kiện lõi/cuộn/gấp theo loại lưới | Giải thích mục tiêu 45.000 m của sự cố tiến độ được bàn giao; dung sai/đóng gói không thể suy ra từ GSM và số cuộn |
| [IWN26-161](<../../User Raw Documents/Order samples/PO_SNY-IWN26-161 (2026.07.03).pdf>) | 6 dòng, 370 cuộn, 44.400 m²; 300 và 425 GSM, nhiều màu, UV 3%; lượng ±10%, kích thước/trọng lượng ±5%; chỉ nhận cuộn dài 40 m, không nhận cuộn ngắn; 300 GSM gấp đôi, 425 GSM waterproof không gấp; vết dầu/bong lớp phủ/lệch màu dẫn tới claim | Một PI chứa các quy cách và yêu cầu xử lý khác nhau. Code multi-line phản ánh một phần; chưa thấy cơ chế kiểm tra chất lượng, dung sai hay claim theo PO |
| [VGC26-5](<../../User Raw Documents/Order samples/PO_SNY-VGC26-5 (2026.07.02) - chop.pdf>) | 18 tấm × 350 m × 16 m = 100.800 m²; 91 GSM, White, mesh 12 mm; đóng kiện; lượng ±5%, kích thước/trọng lượng ghi **+3%**; thanh toán theo bản B/L | Đây là ví dụ thực cho kiểu đặt tấm. Giữ nguyên dấu +3% theo chứng từ, không đổi thành ±3%; các điều khoản xuất hàng/thanh toán nằm ngoài workflow hiện có |

Hai PDF VGC có nội dung trang nhìn thấy tương đương; không tính chúng thành hai đơn khác. Điều kiện riêng trên từng PO chưa đủ để đặt một bộ dung sai mặc định chung.

## Mâu thuẫn giữa tài liệu, demo và source hiện tại

- SRS ghi Dung/Loan là planner và ông Kim là leadership/stakeholder; Blueprint/bàn giao có đoạn gọi vai trò ông Kim chưa rõ. Bản này ghi vai trò **theo SRS**, giữ câu hỏi về quyền duyệt và cách dùng thực tế.
- Bàn giao nói đã khôi phục sự cố CVellis ngày 15/08 nhưng safeguard còn thiếu. Source hiện tại đã có bảo vệ import lịch; điều này không chứng minh dữ liệu DB hiện tại đã được khôi phục. Audit cũ nêu snapshot DB khác với mô tả bàn giao nên cần đối chiếu môi trường thật nếu kiểm chứng sự cố.
- Blueprint nói chưa có test tự động; source hiện tại có test. SRS từng mô tả skip vật tư chưa match, trong khi route import hiện tại có tạo vật tư mới theo các điều kiện ở phần workflow. Các trạng thái “Done/Pending” trong tài liệu phải gắn với thời điểm viết.
- Nội dung tổng hợp dự án/slide có đề cập tự tính nhu cầu MB, trừ kho, drag-drop, audit và AI. Không coi đây là chức năng đã hoàn thành khi source chưa chứng minh tương ứng. Kế hoạch sửa trong `plans` cũng không phải bằng chứng thay đổi đã được áp dụng.
- Source tại `luu-source-cu` là demo: đơn được giữ trong bộ nhớ, số liệu mẫu và công thức beam giả lập `denier×strand×0,0055+1,2`; parser mặc định Shade Net khi thiếu từ khóa. Các lựa chọn này không phải định mức hay quy tắc phân loại đã được xưởng phê duyệt.

Nguồn đối chiếu: [bàn giao](../../tailieubangiao/PROJECT_HANDOVER.md), [yêu cầu tổng](../../tailieubangiao/REQUIREMENTS_MASTER.md), [mâu thuẫn/gap](../../tailieubangiao/CONFLICTS_AND_GAPS.md), [audit công thức](../../plans/HANDOVER_FORMULA_AUDIT_2026-09-19.md), [kế hoạch sửa](../../plans/SNY_IMPLEMENTATION_PLAN_2026-09-18.md), [template beam demo](../../luu-source-cu/sny-planner-tool-20260917-111637/data/warping_template.ts), [parser demo](../../luu-source-cu/sny-planner-tool-20260917-111637/lib/parseSpec.ts).
