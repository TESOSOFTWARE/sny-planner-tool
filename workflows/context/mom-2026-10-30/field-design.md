# M30-04 — Thiết kế trường và đính kèm để triển khai tiếp

Trạng thái: thiết kế sơ bộ có bằng chứng nguồn; chưa đổi schema cho quy cách/đính kèm.

| Nhóm nguồn | Trường app tái sử dụng | Trường cần thiết kế riêng / rà ngữ nghĩa |
|---|---|---|
| ORDER LIST | PI/item, khách, màu, GSM, khổ, lượng, UV/FR, remark, container | Gauge/denier, label, Shipping, ETD, nhiều ngày loading; UV/FR nguồn dạng tỷ lệ cần giữ đơn vị đúng |
| Hướng dẫn đóng gói | Màu, khổ, chiều dài, lượng, eyelet theo item | Khoảng mét/kg cho phép, kiểu gấp, số/màu dây đai, vị trí tem, số cuộn mỗi cục, cấu tạo và kg ống, size/kg bọc; LOSS của file không tự thay hệ số sợi 1,05 |
| Pallet | onPallet, loại/kích thước pallet, itemsPerPallet | Số pallet kế hoạch; số PO tham chiếu; lịch sử nhiều bản kế hoạch cùng đơn |
| Hàng may | Kiểu HEMMED, số tấm mỗi kiện/thùng, quy cách eyelet | Màu/rộng hem, kiểu đường may, màu chỉ, kiểu/khoảng cách eyelet, kích thước cắt/gấp, trọng lượng sau may |
| CC2018 / cc AQ | Tham chiếu PI và quy cách đã có | Lệnh mắc sợi: số sợi, số beam sử dụng, loại beam, dàn vị trí, mét/kg kế hoạch, đồng hồ, máy/ngày chạy; không thay nghĩa `ProductionOrder.beamCount` |

Mẫu bằng chứng theo ô và vị trí code nằm trong `field-coverage.csv` (117 header đại diện); `sheet-inventory.csv` bao phủ 591 sheet ở mức cấu trúc. Chưa đối soát thủ công mọi biến thể trong 465 sheet CC2018.

Đề xuất form chia section 3–4 trường mỗi nhóm, chỉ hiện section áp dụng cho item. Hướng dẫn chung của PI và quy cách riêng của item cần hai cấp khác nhau. Mỗi bản chỉ dẫn lưu nguồn và revision; mẫu đã phát hành giữ snapshot. Các trường tham gia tính toán cần typed value và unit rõ; ghi chú/ảnh giữ nguyên ngữ cảnh.

Đính kèm cần định nghĩa vị trí gắn (PI/item/lệnh), loại và dung lượng, cơ chế lưu bền vững sau deploy và quyền tải/xóa. Lưu tạm file vào thư mục Next/Vercel không đáp ứng lưu bền vững; phần upload chưa triển khai cho đến khi có lựa chọn lưu trữ được cấu hình.
