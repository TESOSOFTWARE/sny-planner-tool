# Tiến độ 10 task — MoM 30/10

Cập nhật 10/11/2026. Người dùng duyệt triển khai local M30-01..05 và M30-08..10; sau đó duyệt mẫu in đề xuất của TESO làm baseline để bắt đầu M30-06/07. Auth dùng email/mật khẩu và role động theo flow Admin đã chốt.

| Task | Trạng thái | Kế hoạch |
|---|---|---|
| M30-01 | KIỂM KÊ 8 workbook / 591 sheet / 117 header đại diện; chưa audit toàn bộ ô | [M30-01 — Kiểm kê nguồn và trường thiếu](M30-01.md) |
| M30-02 | Mapping exact PI; không tự gán item. Mới nhận thêm PO PI CVellis26-2; chưa nhập vào DB và chưa thay thế catalog đầy đủ | [M30-02 — Mapping PI và item](M30-02.md) |
| M30-03 | CODE + MIGRATION + SEED LOCAL: model kế hoạch/actual, API và tab | [M30-03 — Hợp đồng dữ liệu kế hoạch và thực tế](M30-03.md) |
| M30-04 | CODE + MIGRATION LOCAL: upload attachment theo item; các trường may/pallet còn gap | [M30-04 — Quy cách sản xuất và đính kèm](M30-04.md) |
| M30-05 | CODE + MIGRATION LOCAL: actual nhập tay, kế hoạch, dropdown theo dữ liệu; Excel actual import ở Reports | [M30-05 — Tab sản lượng trong Production Orders](M30-05.md) |
| M30-06 | CODE LOCAL: bản in ngày A4 ngang, ngắt theo máy; chờ QA in thực tế/SNY duyệt | [M30-06 — Lập và in kế hoạch kéo sợi ngày](M30-06.md) |
| M30-07 | CODE LOCAL: bản in dệt tuần/tháng A3 ngang; tuần đang mặc định T2–CN; chờ QA in thực tế/SNY duyệt | [M30-07 — In lịch dệt tuần/tháng](M30-07.md) |
| M30-08 | CODE LOCAL: lọc tháng, tổng hợp công đoạn, giữ Rolling theo nhãn; chưa đối soát DB/UI | [M30-08 — Menu báo cáo thống kê](M30-08.md) |
| M30-09 | Login/RBAC local; production release migration + secure Admin bootstrap đã chuẩn bị, chưa chạy; chưa full route audit/UAT | [M30-09 — Đăng nhập và RBAC](M30-09.md) · [Production bootstrap plan](M30-09-production-admin-bootstrap-plan.md) |
| M30-10 | Migration/seed local PASS; browser smoke dropdown PASS; responsive 1280/768 và UAT khách chưa chạy | [M30-10 — Tích hợp, đối soát và UAT](M30-10.md) |

Đầu ra: [kiểm kê và hợp đồng dữ liệu](../../context/mom-2026-10-30/README.md); [hướng dẫn đăng nhập local](../../context/mom-2026-10-30/local-login.md).

Plan bổ sung cho phần customer yêu cầu kiểm kê và đưa field Production Orders lên hệ thống: [M30-01..04 field gap plan](M30-01-04-production-order-field-gap-plan.md).

Plan tổng thể đã được người dùng duyệt để triển khai local. Migration MoM đã áp dụng trên DB local; không deploy/ghi production. Mẫu in M30-06/07 là đề xuất của TESO, chưa được SNY nghiệm thu. Chưa coi các task là nghiệm thu khách: còn QA in thực tế, API integration, browser QA đầy đủ, field reconciliation và UAT SNY.
