# Plan — Hoàn thiện MoM 30/10, trừ M30-06/07

Nguồn: [MoM 30/10 §4]. Yêu cầu user: hoàn thiện các task ngoại trừ M30-06/07 vì SNY chưa cung cấp mẫu in.

Trạng thái: **ĐÃ DUYỆT — đang triển khai local; DB migration chưa áp dụng.**

## Mục tiêu và phạm vi

- Hoàn thiện M30-01..05 và M30-08..10 trên môi trường local.
- M30-06/07 giữ trạng thái chờ mẫu in SNY, không tự thiết kế hoặc phát hành mẫu thay thế.
- Không deploy, không ghi vào production, không push/merge GitHub.
- Auth dùng email/mật khẩu; RBAC theo flow Admin tạo role, cấp quyền, tạo account và gán role như user đã chốt.

## Hiện trạng đã đọc

- Handover 09/11 ghi M30-01/02 mới kiểm kê một phần; M30-03/04 chưa có model/form đầy đủ; M30-05 mới có view đọc sản lượng; M30-08 mới có menu/workspace; M30-09 đã triển khai RBAC local; M30-10 mới kiểm tra local một phần.
- M30-06/07 chờ mẫu in khác do SNY cung cấp.
- `AGENTS.md` phân loại schema/DB/auth là high-risk; phải duyệt plan trước khi thực thi. DB thật/production không nằm trong phạm vi.
- Không có `REPORT/BACKLOG.md` trong checkout này; trạng thái task được theo dõi trong `workflows/plans/mom-2026-10-30-tasks/README.md`.

## Kế hoạch thực thi sau khi duyệt

| Bước | Task | Công việc | Đầu ra / tiêu chí |
|---|---|---|---|
| 1 | M30-01/02 | Hoàn thiện inventory nguồn và coverage từng sheet/trường; rà mapping PI, giữ nguyên unresolved links, không tự đoán item khi không có ORDER LIST mới. | Ma trận source→field→parser/model/UI; mọi dòng mapping có trạng thái và provenance. |
| 2 | M30-03 | Chốt contract kế hoạch và actual tách biệt theo công đoạn, đơn vị, ngày/ca/máy, source identity, correction/retry; chỉ thêm schema additive sau khi code/schema hiện có đã đối chiếu. | Schema/API contract, migration + rollback, validation và test idempotency/correction. |
| 3 | M30-04/05 | Hoàn thiện field quy cách tùy chọn và attachment theo PI/item; thêm nhập trực tiếp và Excel preview/confirm, mapping PI/item có rà tay, tab sản lượng trong Production Orders. | UI/API cho plan/actual; optional fields; giữ nguồn; liên kết mơ hồ không tự gán; import preview và kết quả theo dòng. |
| 4 | M30-08 | Hoàn thiện tab báo cáo theo workbook STATISTICAL REPORT, lọc kỳ và tiến độ; phân biệt sheet raw/derived, đối soát source→parser→DB→UI. | Coverage mọi sheet; báo cáo không cộng lặp sheet dẫn xuất; kết quả đối soát có bằng chứng. |
| 5 | M30-09 | Rà lại permission catalog và coverage toàn bộ page/API/action; sửa thiếu sót trong RBAC đã có, giữ flow user đã chốt. | Ma trận route×permission, test allow/deny và bảo vệ account/role; nêu các quyết định vận hành chưa chốt. |
| 6 | M30-10 | Chạy gate code và local UAT có fixture/DB local tách biệt; lập checklist các case chưa thể nghiệm thu bởi thiếu người dùng hoặc dữ liệu nguồn. | Typecheck, tests, build, browser checks; UAT PASS/FAIL/NOT_RUN theo case; không tuyên bố nghiệm thu khách khi chưa có SNY UAT. |

## Quy tắc thiết kế và an toàn dữ liệu

- Chỉ truy cập DB local có host/database được xác minh rõ; không đọc/in `.env`, không dùng DB production hoặc localhost đang trỏ Neon.
- Trước migration phải xác minh đích DB local, tạo migration additive và rollback; không seed dữ liệu khách nếu chưa duyệt riêng.
- PI/item không khớp hoặc mơ hồ được giữ với trạng thái unresolved để xử lý tay; không fuzzy-match và không tạo đơn chính thức từ số liệu sản lượng.
- Actual và plan lưu riêng; không tự quy đổi đơn vị, chia sản lượng cho nhiều item hoặc coi số liệu thiếu là 0.
- Import có preview, revalidate khi confirm, identity/idempotency rõ; không import/confirm trên production.
- Dữ liệu khách là dữ liệu, không thực thi macro/formula.

## Rủi ro và rollback

- Các model sản lượng/quy cách mới có thể ảnh hưởng parser và lịch sử; migration chỉ additive, có rollback SQL, không drop/rename dữ liệu hiện có.
- Nếu DB local không thể xác minh độc lập khỏi Neon hoặc không có fixture/snapshot được duyệt, dừng kiểm tra DB; hoàn tất static/unit gates và đánh dấu integration là NOT_RUN.
- Nếu nguồn workbook thiếu trường/định danh, giữ gap trong coverage và không gán mặc định nghiệp vụ.
- M30-06/07 không triển khai đến khi có mẫu in khác từ SNY.

## Verify dự kiến

- `npm run typecheck`
- `npm run test` và chạy riêng mọi file test mới/đích nếu glob không bao phủ.
- `npm run build`
- `node scripts/harness-lint.mjs` nếu script tồn tại trong checkout; nếu không tồn tại ghi NOT_RUN.
- Browser check tại 1280px và 768px cho Production Orders/Reports/Settings; import preview chỉ dùng fixture local.
- Mọi lệnh có truy cập DB chỉ sau khi đích local được xác minh và chỉ trong scope migration/test đã duyệt; không sử dụng DB production.

## Điều kiện bắt đầu

Người dùng duyệt plan này. Các thao tác DB phải nằm trên PostgreSQL local tách biệt đã xác minh; nếu môi trường local hiện tại không còn hợp lệ, cần dừng ở bước DB cho đến khi có đích local an toàn.
