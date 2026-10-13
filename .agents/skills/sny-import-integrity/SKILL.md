---
name: sny-import-integrity
description: Đảm bảo toàn vẹn import/export Excel của SNY (đơn hàng, lịch dệt, sản lượng, tồn kho). Dùng khi chạm src/lib/excel/**, route import*/confirm, template export hoặc fixture workbook.
---

# SNY Import integrity

Nạp kèm `sny-api-data`. Luật đầy đủ: `.agents/references/RULES-DETAIL.md` (mục API/DB/Excel). Checklist thực thi:

## Preview / Confirm
- Preview **không ghi** DB. Confirm phải revalidate payload + state hiện tại; định rõ atomic hay partial-success, trả outcome/count đúng từng dòng.
- Re-import y hệt không được nhân đôi output/tồn kho. Identity và phạm vi thay thế lấy từ schema/nguồn thực tế; PI + ngày không phải khoá chung.
- Parse workbook và gọi mạng **ngoài** transaction.

## Đọc workbook
- Kiểm fixture đã sanitize: header, đơn vị, hệ ngày 1900/1904, merged cell (ngày gộp → gán ngày đầu), dòng footer.
- Date qua `serialToDate()` UTC-safe; hiển thị dd/MM/yyyy giờ VN. Thiếu dữ liệu ≠ 0; giữ `dataSource` và provenance.
- Không fuzzy-match tự động PI/khách mơ hồ → đánh dấu ambiguous cho user chọn.
- Giới hạn upload/row/cell; từ chối định dạng không hỗ trợ (báo rõ `.xlsb`). Không chạy macro/formula.

## Export
- Escape text user bắt đầu bằng `= + - @` (formula injection).
- Template giữ đúng số cột/tên cột hiện hành; đổi cột phải cập nhật parser + test cùng lúc.

## Verification
`npm run test` các file `src/lib/excel/*.test.ts` liên quan + `npm run typecheck`; đổi route thì thêm `npm run build`. Không dùng import/confirm production làm QA.
