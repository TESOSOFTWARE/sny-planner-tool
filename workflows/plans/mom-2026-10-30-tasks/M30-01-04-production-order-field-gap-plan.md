# Plan — Kiểm kê và bổ sung field Production Orders

Nguồn: [MoM 30/10 §2, §4]; yêu cầu user 10/11: thống kê field còn thiếu trong các file Production Orders và lập plan sửa.

Trạng thái: **ĐÃ TRIỂN KHAI MỘT LÁT CẮT LOCAL cho field ORDER LIST/PO đã rõ nghĩa; kiểm kê toàn bộ nguồn và các nhóm quy cách khác vẫn mở.** M30-06/07 đã có mẫu in đề xuất TESO làm baseline; chờ SNY xác nhận.

## Mục tiêu

Lập danh mục có bằng chứng cho mọi trường trong nguồn Production Orders, xác định trường nào đã lưu/đã nhập/đã hiện trên web và trường nào thật sự thiếu; sau khi duyệt data contract, bổ sung có kiểm soát vào đúng cấp PI, item, production plan hoặc attachment.

## Hiện trạng đã xác minh

- Audit offline hiện có: 8 workbook, 591 sheet, 117 header đại diện. Inventory chỉ quét 20 dòng đầu mỗi sheet; chưa phải kiểm kê toàn bộ biến thể.
- Web/schema đã có nhiều field đơn hàng: PI, khách, order/delivery date, container, item/sub-line, khổ/chiều dài/GSM, production GSM, màu/MB/Item Code, UV/FR, eyelet, order type, carton/bale, pallet, laminate GSM, tolerance và ghi chú.
- Đã có attachment theo dòng đơn; upload JPEG/PNG/WebP/PDF, tối đa 5 MB; migration đã chạy local.
- PO PDF mới cho PI `CVellis26-2` bổ sung một nguồn đặt hàng: size/quantity/GSM/color, shipping terms, payment terms, loading date, container và packing note. File này chưa nhập vào DB và không thay thế ORDER LIST đầy đủ.
- Field design đã ghi một số gap: Gauge/Denier, Shipping/ETD/loading dates, chi tiết dây đai/nhãn/ống, số pallet/lịch sử pallet, chi tiết may, và lệnh mắc sợi. Chưa xác nhận đủ ngữ nghĩa tất cả field.
- Không đổi nghĩa `beamCount` thành beams used; không tự diễn giải SMALL/BIG, Denier/Gauge, loss hoặc đơn vị khi chưa có bằng chứng.

## Kế hoạch: Input → bước làm → Output

| Bước | Input | Việc làm | Output / acceptance |
|---|---|---|---|
| 1. Chốt nguồn | 8 workbook đã rà, PDF `CVellis26-2`, thư mục source khách đang được bàn giao | Cập nhật manifest nguồn, SHA, file/sheet/page, ngày/kỳ, nguồn và trạng thái; xác nhận không thiếu file nào trong scope TESO đã nhận. | Danh sách nguồn đầy đủ; PDF/Excel không bị gộp thành cùng loại nguồn; nguồn còn thiếu có tên và owner. |
| 2. Kiểm kê field | Header, vùng dữ liệu đại diện, parser/template hiện có | Với mỗi trường, ghi vị trí nguồn (file/sheet/cell/page), label gốc, ví dụ, đơn vị, phạm vi (PI/item/plan/actual/attachment), dữ liệu có thật/blank/formula/merged. Duyệt header mọi sheet; với các layout lặp chỉ chọn mẫu đại diện có lý do và ghi các biến thể. | Coverage matrix 100% file/sheet; không chỉ dùng 20 dòng đầu để kết luận field thiếu; toàn bộ trường đại diện có provenance. |
| 3. Đối chiếu web | Coverage matrix; Prisma schema; parser/validation; form/detail; import/export; API | Gắn từng field vào một trạng thái: `Đã có + nhập + lưu + xem`; `Có trong DB nhưng thiếu UI`; `UI có nhưng không round-trip`; `Thiếu thật`; `Chưa rõ nghĩa`. Ghi file/hàm/route và bằng chứng cho từng trạng thái. | Gap matrix truy được từ nguồn đến field/route; không khai báo thiếu nếu chỉ đang bị ẩn ở detail/section. |
| 4. Chốt data contract | Gap matrix và các ví dụ nguồn | Chọn owner: PI chung, item/sub-line, production plan theo công đoạn, actual, hoặc file đính kèm. Quy định kiểu, đơn vị, nullable/required, enum/free text, nguồn có thẩm quyền, cách import/retry/correction, hiển thị và quyền sửa. | Data dictionary và danh sách quyết định SNY cần trả lời; không thêm JSON bag thay cho field có nghĩa nghiệp vụ rõ. |
| 5. Ưu tiên | Gap đã phân loại và quyết định được duyệt | P0: field rõ nghĩa trong ORDER LIST/PO và cần dùng ngay để lập đơn. P1: field packaging/pallet/garment chỉ áp dụng một số đơn. P2: work-order/beam/process-plan có đơn vị/identity còn cần xác nhận. | Backlog chia theo nhóm, có phụ thuộc và acceptance riêng; field chưa rõ nghĩa giữ `NOT_READY`, không chặn field đã đủ căn cứ. |
| 6. Implement theo lát cắt | Data contract đã duyệt; file/hàm khóa; migration plan và rollback | Với mỗi lát cắt: schema additive → validator → create/edit/detail → parser/template/import preview/confirm → test. PI header dùng field chung; quy cách khác nhau ở từng item phải nằm per-line. Kế hoạch kéo sợi/mắc sợi/dệt không bị ghi nhầm vào PO master. Attachment tiếp tục gắn item/PI theo hợp đồng đã duyệt. | Field lưu và round-trip từ form/import đến detail; mỗi import giải trình new/duplicate/conflict/invalid, giữ PI/NO nguồn và link unresolved khi mơ hồ. |
| 7. QA/UAT | Sanitized fixtures lấy từ từng nguồn; DB local tách biệt; account theo role | Parser unit tests; API create/edit/import preview-confirm/retry; round-trip file → DB → UI; kiểm tra ngày/decimal/units; browser 1280/768, keyboard/focus/error/empty; SNY xác nhận UAT. | PASS chỉ cho case đã chạy; mapping/detail/tổng khớp theo đơn vị và precision; không gọi là nghiệm thu khi thiếu UAT. |

## Gap cần phân loại từ các nguồn hiện có

### Kết quả triển khai 10/11/2026

Đã bổ sung các field nullable theo từng dòng đơn: `gaugeDenier`, `labelInstruction`, `shippingNote`, `etdDate`, `etdNote`, `loadingDate`, `loadingDateNote`, `loadingDate2`, `loadingDate2Note`; cùng `shippingTerms` và `paymentTerms` cho thông tin PI/PO dùng chung. Các field được nối qua validation, tạo/sửa đơn, sửa PI, parser/import Excel, template và trang chi tiết. `ETD`/loading date được lưu kiểu ngày; nếu ô nguồn là text/giá trị không parse chắc chắn thì giữ nguyên trong note, không ép thành ngày. Giá trị `Shipping` opaque được giữ nguyên dạng text.

Migration additive và rollback nằm tại `prisma/sql/20261110_production_order_source_fields.sql` và `prisma/sql/rollback_20261110_production_order_source_fields.sql`. Tại lần kiểm tra 10/11, DB local đã có đủ 11 cột với kiểu nullable tương ứng; vì vậy chưa chạy lại SQL migration để tránh duplicate-column. Không truy cập hoặc ghi production. PO `CVellis26-2` vẫn chưa được import.

Phần này không đóng toàn bộ M30-01/04: thông tin strap/banding, core/wrap, pallet count/history, chi tiết may, và work order CC2018/AQ vẫn cần đối soát ngữ nghĩa/phạm vi trước khi thiết kế field riêng.

| Nhóm | Hiện đã có trên web | Cần kiểm tra/khả năng thiếu |
|---|---|---|
| ORDER LIST / PO | PI, khách, dates, container, item fields, order type, width/length/GSM, color/MB, UV/FR, packing/eyelet, comments, calculated totals | Gauge/Denier; shipping/payment terms; ETD/loading date(s); label; xác nhận field nào dùng header hay item. PO `CVellis26-2` là nguồn cho một PI, chưa phải full catalog. |
| Hướng dẫn đóng gói | ROLL/BALE/CARTON/HEMMED, paper core, outer wrap, carton/bale counts/dimensions, pallet fields, note, attachment | Strap/banding count/color/strength, label position, wrapping bag size/weight, tube/core weight/structure, allowed length/weight range. Xác minh xem đây là PO attribute hay work instruction revision. |
| Pallet | Có on-pallet, pallet type/dimensions, items-per-pallet | Pallet count, referenced PO(s), repeated plan history/revision. Xác minh quantity là per order, per line hay per shipment. |
| Kế hoạch hàng may D | HEMMED, sub-packing, eyelet fields và một số pack fields | Hem color/width, sewing type/thread color, eyelet spacing/layout, cut/fold dimensions, finished weight. Cần xác định các field bắt buộc chỉ cho hàng may. |
| CC2018 / cc AQ / kéo sợi | Có source PI, color, beam count và generic plan fields | Beam type, beams used vs number of frames, strand, dàn positions, meters/kg planned, machine/date/load data. Giữ `ProductionOrder.beamCount` đúng nghĩa “số dàn”; phần nào là lệnh sản xuất cần plan entity. |

## Quyết định/chờ xác nhận

- Đã rõ: một PI nhiều item; field khác nhau theo item phải lưu theo sub-line; pallet/hàng may là optional; user chọn item khi PI khớp nhiều dòng; unresolved PI được giữ nguyên.
- Cần SNY/lead xác nhận: ý nghĩa và đơn vị chính xác cho Gauge/Denier; shipping/ETD/loading date ownership; beam type/beams used; pallet count/PO references/history; các thông số may/đóng gói chưa có mapping rõ.
- Không chờ các câu hỏi này để hoàn thiện những field đã rõ trong order form/import.
- Không nhập PO `CVellis26-2` vào DB tự động từ PDF. Nếu cần tạo đơn test/customer order, đó là thao tác ghi dữ liệu riêng, chỉ thực hiện trên môi trường/PI được duyệt.

## Rủi ro, migration và rollback

- Chỉ dùng migration SQL additive cho field/schema; không rewrite/backfill đơn lịch sử nếu chưa có mapping và duyệt riêng.
- Trước DB write: xác minh DB local/staging bằng host/database; backup theo đúng version PostgreSQL; tuyệt đối không dùng local `.env` nếu target là production.
- Mỗi migration có rollback riêng. Rollback không drop cột/table đã có dữ liệu mới nếu chưa export và duyệt tác động.
- Excel/PDF là dữ liệu nguồn, không thực thi macro/formula; ngày parse UTC-safe; null không biến thành 0; đơn vị giữ rõ; không fuzzy-match.
- Nếu một field chỉ có trong file khách nhưng không có ý nghĩa chắc chắn, đưa vào decision register trước, không đoán và không tự gán vào field gần tên.

## Tiêu chí hoàn tất

1. 100% nguồn Production Orders trong phạm vi đã nhận có inventory file/sheet/page.
2. Mỗi header/field được đưa vào matrix với nguồn, đơn vị, phạm vi dữ liệu, status web, parser, validator, model, màn hình và quyết định.
3. Từng gap được chứng minh là missing hoặc “có trong DB nhưng chưa nhập/xem được”; không trộn hai loại.
4. Field mới được duyệt có create/edit/import/export/detail round-trip test và fixture theo nguồn; field optional không ép các loại đơn khác nhập.
5. Không dùng dữ liệu khách thật để QA production; UAT khách ghi riêng với trạng thái PASS/FAIL/NOT_RUN.

## Thứ tự phụ thuộc

M30-01 source inventory → M30-02 PI/sub-line mapping → M30-03 field/data contract → M30-04 typed optional fields/attachment → M30-05 form/import/report view → local QA → SNY UAT. M30-06/07 print views là luồng riêng, hiện có baseline TESO và chờ SNY xác nhận.
