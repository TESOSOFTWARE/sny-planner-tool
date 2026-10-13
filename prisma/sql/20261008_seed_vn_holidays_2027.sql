-- Seed ngày lễ Việt Nam 2027 — CHỈ các ngày cố định dương lịch, đã chắc chắn.
-- Apply only to a disposable test database during this task. Do not run
-- against the customer database until the deployment is reviewed.
--
-- KHÔNG seed (chưa chắc chắn, chờ khách hoặc công bố của Chính phủ):
--   * Tết Nguyên đán 2027 — mùng 1 rơi vào T7 06/02/2027 nhưng lịch nghỉ
--     chính thức chưa được công bố; hằng năm thường lệch so với mùng 1-5.
--   * Giỗ Tổ Hùng Vương 2027 (10/3 âm lịch) — các nguồn mâu thuẫn (15/4 vs 18/4).
--   * Ngày liền kề của Quốc khánh (1/9 hay 3/9) — Chính phủ chọn từng năm.
--
-- KHÔNG seed factory_calendar_months: nhật ký sản lượng sheet KNITTING của
-- 04/2026 và 05/2026 cho thấy nhà máy LÀM cả 4 thứ 7 tháng 4 và nghỉ đủ
-- Chủ nhật. Mặc định [0] trong code đã khớp, chưa tháng nào cần override.
BEGIN;

INSERT INTO "factory_calendar_exceptions"
  ("id", "date", "isWorking", "kind", "note", "updatedAt")
VALUES
  ('seed_vn_2027_0101', DATE '2027-01-01', false, 'HOLIDAY', 'Tết Dương lịch',          CURRENT_TIMESTAMP),
  ('seed_vn_2027_0430', DATE '2027-04-30', false, 'HOLIDAY', 'Giải phóng miền Nam',     CURRENT_TIMESTAMP),
  ('seed_vn_2027_0501', DATE '2027-05-01', false, 'HOLIDAY', 'Quốc tế Lao động',        CURRENT_TIMESTAMP),
  ('seed_vn_2027_0902', DATE '2027-09-02', false, 'HOLIDAY', 'Quốc khánh',              CURRENT_TIMESTAMP)
ON CONFLICT ("date") DO NOTHING;

COMMIT;
