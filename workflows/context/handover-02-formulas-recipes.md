# 02 — Công thức, cấu hình màu và giới hạn áp dụng

## Công thức đơn hàng đang có trong code

| Đại lượng | Công thức |
|---|---|
| Tổng mét — đặt mét | `lengthM` |
| Tổng mét — đặt cuộn | `qty × rollLength` |
| Tổng mét — đặt tấm | `qty × pieceLength` |
| Diện tích | `widthM × totalMeters` |
| Trọng lượng PO | `qtySqm × gsm / 1000` |
| Nhu cầu sợi nội bộ | `qtySqm × (productionGsm ?? gsm) / 1000 × 1.05` |

Trọng lượng PO và nhu cầu sợi phục vụ hai mục đích khác nhau. Hệ số 1,05 là cộng 5%, không phải chia 0,95. Không dùng loss trên kim hoặc dung sai hợp đồng thay hệ số này.

Nguồn: [orderWeight.ts](../../src/lib/calculations/orderWeight.ts), [spec GSM sản xuất](../../docs/specs/i2-production-gsm.md).

## Ba công thức Work Order đã được bàn giao

Nguồn: [Formular.xlsx](<../../../User Raw Documents/Formular.xlsx>), `Sheet1!B2/B4`; [EXTRUDER 2023](<../../../User Raw Documents/EXTRUDER 2023.xlsx>), `Sheet2`, `Sheet4!A2:F3`.

| Kết quả | Công thức và ví dụ |
|---|---|
| Mét/beam | `kg × 9.000.000 / strands / denier`; 38 kg, 144 sợi, 280D → 8.482,142857… m; nguồn ghi 8.482 m |
| Kg/beam | `meters × strands × denier / 9.000.000`; 8.500 m, 144 sợi, 280D → 38,08 kg |
| Sợi/beam | `widthCm × needleLossFactor × needlesPerInch × fabricWidths / 2,54 / beamsUsed`; 300 × 1,05 × 8 × 2 / 2,54 / 14 → 141,732283…; nguồn ghi 142 sợi |

Tên và đơn vị input công thức đã có. Phải phân biệt mật độ kim/inch, số khổ dệt, số beam sử dụng và số dàn. Source gọi `ProductionOrder.beamCount` là “Số dàn”; không tự đưa trường đó vào mẫu số. `needleCount` được form điền từ wale, nhưng dữ liệu cũ vẫn cần kiểm tra đơn vị trước khi tự lấy vào calculator.

Các ví dụ phù hợp với làm tròn gần nhất; chưa chứng minh một quy tắc vận hành chung, nhất là `.5`, hoặc luôn làm tròn lên số sợi. Ví dụ 38,08 kg vốn đã có đúng hai chữ số thập phân cũng không chứng minh mọi kg đều phải làm tròn hai số. `half-up` và tên `operationalValue` trong plan trước là đề xuất thiết kế, chưa phải yêu cầu khách xác nhận. Giữ kết quả raw và ví dụ nguồn khi lập test.

## MB/FR và phân bổ nhiều màu

Nguồn: [kế hoạch đặt MB 2025](<../../../User Raw Documents/kế hoạch đặt MB 2025.xlsx>).

- `tính % MB !G5 = C5×D5×E5×F5/1000` → 10.425,998 kg hàng; `I5=H5×1,05` → 10.947,2979 kg; `M5=I5×L5/100×1,1`, L5=0,8 → 96,33622152 kg MB.
- Cùng sheet có loss 1,1 và 1,2; có chia phần khối lượng theo `/(1+2)×2`. Không áp một hệ số cho mọi dòng.
- `MB Korea 20.5.2025!D86:D88`: tổng trọng số `0,9+0,1+1,8+0,2+1,8+1,8=6,6`; ba mã 3160-2, 3233-5, 8005A nhận trọng số lần lượt 0,3; 4,5; 1,8. Với 3.600 kg × 1,1 × tỷ lệ 4%, kết quả là 7,2; 108; 43,2 kg. Đây là mẫu cụ thể theo cột đơn, chưa xác nhận là trọng số cho ảnh DESERT SAND A/B.
- `tính FR!M9` có hệ số cuối 1,1; `M15` không có. Chưa thấy bảng điều kiện chung lựa chọn các hệ số.
- [Extruder 2024/2025](<../../../User Raw Documents/EXTRUDER 2024 + extruder 2025 O.xlsx>), `9.2024!J1015:K1015`, ghi `MÀU *3%` và `100KG NHỰA =3KG MÀU`; các lệnh khác dùng 3,5%/3,7%. Cơ sở pha của các lệnh này đã rõ; không đồng nhất mọi phép dự toán MB từ kg thành phẩm với kg nhựa mẻ pha.

Phải giữ riêng: tỷ lệ pha MB, tỷ lệ UV/FR, loss sản xuất kg, loss trên kim và dung sai PO. Cùng ghi “3%” không chứng minh cùng ý nghĩa.

## Mẫu DESERT SAND#467 A/B

Thông số chung trong ảnh: 325 GSM; Tape `2.0mm-440D`; Mono `24-450D`; Course 14; Wale 6; MB Rate 3%; `With heating machine`.

| Dàn | Thành phần theo thứ tự |
|---|---|
| FIRST — Mono | Beige 3160-2 / Korea; Beige 3233-5 / Korea; Snow white 1065 / Châu Âu |
| MIDDLE — Mono | Beige 3160-2 / Korea; Beige 3233-5 / Korea |
| BACK — Tape | Light beige 3233-5 / Korea; thành phần thứ hai phụ thuộc A/B |
| BACK/2 của A | Dark beige 3160-2 / Korea |
| BACK/2 của B | Beige 8005A / Arirang |

Giữ thứ tự, nhãn, mã và nhà cung cấp; không gộp các thành phần chỉ vì cùng mã. `ColorPreset` hiện tại chưa biểu diễn đủ cấu trúc này.

Heating là yêu cầu sản xuất nhìn thấy trong ảnh/PO. Chưa tìm được công thức định lượng tác động của heating trong phần đã đối chiếu; đề xuất lưu/hiển thị chỉ dẫn, chưa thêm hệ số. Điều này không chứng minh heating không ảnh hưởng vật lý đến sản phẩm.

Còn cần xác lập cho tích hợp: recipe thuộc khách/sản phẩm nào; cách chọn A/B; lịch sử khi sửa; trọng số áp dụng chính xác cho mẫu A/B; điều kiện chọn các hệ số tự động. Những ví dụ đã có tiếp tục dùng làm bộ đối chiếu, không hỏi khách gửi lại công thức chung.
