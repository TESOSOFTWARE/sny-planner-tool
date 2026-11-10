# Báo cáo triển khai MoM 30/10 — cập nhật 10/11/2026

## Bổ sung mẫu in kế hoạch — 10/11/2026

- M30-06: thêm xem trước/in kế hoạch kéo sợi ngày trên A4 ngang, nhóm theo máy, có PI/item, khách, màu/MB, GSM, chỉ tiêu, kế hoạch, ô ghi thực tế và chữ ký.
- M30-07: thêm xem trước/in kế hoạch dệt theo tuần hoặc tháng trên A3 ngang, có ngày, máy, PI/item, khách, màu, khổ/GSM, kế hoạch, ô ghi thực tế và ghi chú.
- Tuần tạm tính từ thứ Hai đến Chủ nhật. Đây là baseline do TESO đề xuất theo duyệt của người dùng, chưa phải xác nhận nghiệm thu từ SNY.
- API in chỉ đọc plan trong khoảng ngày, yêu cầu quyền `output.print`; không ghi DB và không in production data. Typecheck, `git diff --check` và build PASS. Chưa chạy browser/physical print QA trong lượt triển khai này; build có cảnh báo ESLint chưa cài và Browserslist DB cũ.

## Bổ sung triển khai field Production Orders — 10/11/2026

- Thêm 11 field nullable cho dữ liệu ORDER LIST/PO đã rõ: Gauge & Denier, Label instruction, Shipping note, ETD/date note, hai loading date/date note, Shipping Terms, Payment Terms.
- Nối field qua schema/types/validation, tạo đơn, sửa đơn và PI, Excel parser/import, template, import comparison, form multi-line, PI editor và order detail. Ngày Excel hợp lệ lưu dạng date-only; nội dung không parse được giữ ở note để không mất dữ liệu nguồn.
- Có SQL migration additive và rollback tại `prisma/sql/20261110_production_order_source_fields.sql` và `prisma/sql/rollback_20261110_production_order_source_fields.sql`.
- DB local đã có đủ 11 cột khi preflight 10/11; migration không được chạy lại để tránh lỗi cột trùng. Chưa ghi dữ liệu PDF khách vào DB; không truy cập production.
- Nhóm packing guide chi tiết, pallet, hàng may và work-order CC2018/AQ vẫn chưa hoàn tất vì cần inventory đầy đủ và làm rõ phạm vi/đơn vị.
- Xác minh bổ sung: parser tests 16/16; toàn bộ suite hiện có 216/216; typecheck PASS; build exit 0; template có 55 cột và cả hai sample rows đều đủ 55 ô; `git diff --check` PASS. Build có cảnh báo môi trường thiếu ESLint và Browserslist DB cũ.

Plan được người dùng duyệt: hoàn thiện M30-01..05 và M30-08..10 trong local; sau đó người dùng duyệt mẫu in TESO đề xuất làm baseline cho M30-06/07. Không deploy, không ghi production.

## Kết quả theo task

| Task | Đã làm | Trạng thái / giới hạn |
|---|---|---|
| M30-01 | Chạy lại audit offline 8 workbook, 591 sheet; tạo manifest, inventory và coverage 117 header đại diện. | Chưa audit mọi ô; inventory chỉ scan 20 dòng đầu mỗi sheet. |
| M30-02 | Giữ PI nguồn, thêm tra item bằng exact PI và chọn item tường minh khi nhập tay/kế hoạch. Ngày 10/11 nhận thêm PO PDF của PI `CVellis26-2`. | 193 dòng kế hoạch trước đó được so với catalog cũ tới 13/05/2026: 2 candidate PI, 191 không có trong catalog đó. PO mới bổ sung một đơn nguồn, chưa nhập DB và không thay thế catalog hiện hành đầy đủ. |
| M30-03 | Thêm model riêng `ProductionOutputPlan`, `ManualProductionEntry`, API kế hoạch/actual và lịch sử revision kế hoạch. | Migration đã áp dụng trên DB local. Chưa có upload workbook riêng cho kế hoạch; actual Excel tiếp tục dùng preview/confirm ở Reports. |
| M30-04 | Thêm attachment theo item ProductionOrder, upload/list/view, allowlist JPEG/PNG/WebP/PDF, kiểm tra chữ ký và giới hạn 5 MB; lưu trong PostgreSQL. | Migration đã áp dụng trên DB local. Các field đóng gói đã có được tái dùng; field chuyên biệt pallet/hàng may chưa đủ chứng cứ để thêm schema typed an toàn. |
| M30-05 | Thêm tab tại `/orders/production` cho actual nhập tay, kế hoạch và sửa kế hoạch; dropdown máy/PI/màu/chỉ tiêu/đơn vị lấy từ DB; chọn item theo PI. | Browser smoke xác nhận dropdown có TEST-EXT-01, TEST-M30-001, màu và chỉ tiêu từ fixture; chưa kiểm tra riêng 1280px/768px. Import Excel actual được truy cập qua Reports, chưa nhúng modal upload trực tiếp trong tab. |
| M30-06/07 | Bổ sung API đọc kế hoạch theo ngày/khoảng ngày có quyền `output.print`; thêm xem trước/in A4 ngày cho kéo sợi và A3 tuần/tháng cho dệt. | Chưa QA browser/giấy; tuần mặc định T2–CN; TESO đề xuất được người dùng duyệt làm baseline, chờ SNY xác nhận nội dung và quy ước. |
| M30-08 | Thêm API/filter tháng và summary riêng cho kéo sợi, mắc sợi, dệt, cuộn, đóng gói; Rolling giữ metric label; manual tách khỏi imported. | API chưa chạy qua browser và dữ liệu demo không thay thế đối soát workbook thật. Danh mục 14 sheet trong [report coverage](report-coverage.md); không tái tính công thức workbook. |
| M30-09 | Giữ đăng nhập email/mật khẩu và RBAC roles/accounts đã có; bổ sung permission mapping cho API kế hoạch, nhập actual, tra item, Reports. | Chưa rà đủ mọi endpoint/action, chưa UAT từng role hoặc release. |
| M30-10 | Chạy typecheck, unit/regression suite, Prisma validation/build; áp migration và seed TEST local idempotent. | API integration, browser 1280/768 và UAT khách NOT_RUN. |

## Bằng chứng chạy

- `python3 scripts/audit-mom-3010.py` — PASS; `manifest_files=8`, `inventory_sheets=591`, `mapping_rows=193`, `Representative field headers=117`.
- `npx prisma validate --schema prisma/schema.prisma` — PASS.
- `npm run typecheck` — PASS.
- `node --import tsx --test $(rg --files src | rg '\.test\.ts$')` — PASS, 215/215.
- `npm run build` — exit 0, route compilation hoàn tất; build log báo ESLint chưa được cài và Browserslist DB đã cũ.
- `git diff --check` — PASS.
- PostgreSQL local được xác minh là `sny_planner_local`, `127.0.0.1:55432`, version 18.6; không truy cập production.
- `prisma/sql/20261109_mom_production_plans_manual_entries.sql` — áp dụng PASS trong transaction.
- `node --env-file=.env.local --import tsx scripts/seed-mom-3010-demo.ts --apply` — PASS hai lần; exact counts sau lần chạy lại: 2 test order lines, 2 plans, 2 manual entries, 1 actual mỗi công đoạn Extruder/Warping/Knitting/Rolling, 1 Packing day, 1 attachment.
- `npm run typecheck` sau migration và seed script — PASS.
- Browser local `/orders/production` — tab nhập trực tiếp hiển thị các dropdown đã có data; chọn PI `TEST-M30-001` hiện hai item để chọn. Chỉ kiểm tra ở viewport đang mở, chưa hoàn tất hai kích thước QA 1280px/768px.
- `node scripts/harness-lint.mjs` — NOT_RUN; script không có trong checkout.

## Việc còn lại trước khi tuyên bố hoàn tất

1. Chạy API integration trên dữ liệu fixture local sau khi migration đã áp dụng.
2. Chạy browser QA 1280px/768px cho Production Orders, Reports, attachment và Settings; kiểm tra quyền allow/deny.
3. Hoàn tất field reconciliation cho mọi biến thể workbook thay vì chỉ header đại diện; cập nhật mapping khi có ORDER LIST hiện hành.
4. Tích hợp upload Excel kế hoạch với preview/confirm và contract thay thế/idempotency đã chốt.
5. Nhờ SNY UAT quy cách/attachment, báo cáo, role matrix và duyệt mẫu in đề xuất M30-06/07.

Không deploy, không ghi production và không push/merge GitHub trong lượt này.
