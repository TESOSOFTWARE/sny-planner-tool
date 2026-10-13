-- 20260929 — Đồng bộ default của `hasPaperCore` với quy tắc nghiệp vụ:
-- lõi giấy CHỈ áp dụng cho đơn đóng theo cuộn (ROLL).
-- BALE / CARTON => false.
--
-- CHƯA CHẠY trên bất kỳ DB nào. Cần backup + duyệt target trước khi apply.
--
-- Lưu ý: script chỉ đổi DEFAULT của cột, KHÔNG sửa dữ liệu dòng cũ
-- (giữ đúng nguyên tắc "không bulk rewrite dữ liệu đã lưu" của AGENTS.md).

ALTER TABLE "production_orders"
  ALTER COLUMN "hasPaperCore" SET DEFAULT false;
