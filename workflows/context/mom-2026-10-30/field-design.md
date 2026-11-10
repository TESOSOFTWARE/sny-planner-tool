# M30-04 — Thiết kế trường và đính kèm

Trạng thái: schema hiện có bao phủ nhiều trường đơn hàng; đã thêm metadata/bytes attachment theo dòng đơn vào schema + migration local. Các trường may/pallet riêng chưa được đối soát đủ để thêm typed fields.

| Nhóm nguồn | Trường app tái sử dụng | Trường cần thiết kế riêng / rà ngữ nghĩa |
|---|---|---|
| ORDER LIST | PI/item, khách, màu, GSM, khổ, lượng, UV/FR, remark, container | Gauge/denier, label, Shipping, ETD, nhiều ngày loading; UV/FR nguồn dạng tỷ lệ cần giữ đơn vị đúng |
| Hướng dẫn đóng gói | Màu, khổ, chiều dài, lượng, eyelet theo item | Khoảng mét/kg cho phép, kiểu gấp, số/màu dây đai, vị trí tem, số cuộn mỗi cục, cấu tạo và kg ống, size/kg bọc; LOSS của file không tự thay hệ số sợi 1,05 |
| Pallet | onPallet, loại/kích thước pallet, itemsPerPallet | Số pallet kế hoạch; số PO tham chiếu; lịch sử nhiều bản kế hoạch cùng đơn |
| Hàng may | Kiểu HEMMED, số tấm mỗi kiện/thùng, quy cách eyelet | Màu/rộng hem, kiểu đường may, màu chỉ, kiểu/khoảng cách eyelet, kích thước cắt/gấp, trọng lượng sau may |
| CC2018 / cc AQ | Tham chiếu PI và quy cách đã có | Lệnh mắc sợi: số sợi, số beam sử dụng, loại beam, dàn vị trí, mét/kg kế hoạch, đồng hồ, máy/ngày chạy; không thay nghĩa `ProductionOrder.beamCount` |

Mẫu bằng chứng theo ô và vị trí code nằm trong `field-coverage.csv` (117 header đại diện); `sheet-inventory.csv` bao phủ 591 sheet ở mức cấu trúc. Chưa đối soát thủ công mọi biến thể trong 465 sheet CC2018.

Đề xuất form chia section 3–4 trường mỗi nhóm, chỉ hiện section áp dụng cho item. Hướng dẫn chung của PI và quy cách riêng của item cần hai cấp khác nhau. Mỗi bản chỉ dẫn lưu nguồn và revision; mẫu đã phát hành giữ snapshot. Các trường tham gia tính toán cần typed value và unit rõ; ghi chú/ảnh giữ nguyên ngữ cảnh.

Đính kèm hiện gắn với một item `ProductionOrder`, giới hạn 5 MB, nhận JPEG/PNG/WebP/PDF, kiểm tra chữ ký nội dung, lưu byte trong PostgreSQL và bảo vệ tải lên/xem/xóa bằng quyền order. Cách lưu DB có tính bền vững và nằm cùng backup DB; vận hành cần theo dõi tăng trưởng DB và backup. Migration attachment đã được áp dụng trên DB local theo báo cáo 09/11.

## Lát cắt field ORDER LIST/PO bổ sung ngày 10/11/2026

Đã thêm nullable field và nối qua create/edit/import/template/detail cho `Gauge & Denier`, `LABEL`, `Shipping`, `ETD`, `LOADING DATE`, `Loading date2`, `Shipping Terms`, `Payment Terms`. Giá trị text bất thường trong cột ngày được lưu nguyên vào note nguồn; không đoán ngày. `Shipping` được giữ nguyên là ghi chú nguồn do ví dụ chứa giá trị opaque. Terms từ PO được lưu riêng, không lấy từ cột Shipping.

SQL additive và rollback ở `prisma/sql/20261110_production_order_source_fields.sql` và `prisma/sql/rollback_20261110_production_order_source_fields.sql`. Lúc kiểm tra local 10/11, cả 11 cột đã tồn tại với kiểu nullable tương ứng nên không chạy lặp migration. Chưa ghi dữ liệu khách từ PDF vào DB.

Nhóm field còn thiếu/chưa chốt: packing guide (tolerance, strap/banding, label position, core/wrap, LOSS), pallet count/reference/history, garment/May D và các trường work-order của CC2018/AQ. Chúng không được coi là xong chỉ vì có attachment hoặc field note tổng quát.
