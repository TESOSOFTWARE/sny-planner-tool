-- 20261012 — [FB 12/10 #5] GSM thập phân, card 1210-02.
-- CHƯA CHẠY trên DB dùng chung. Chỉ apply sau backup và duyệt target.
-- Đổi 5 cột integer sang double precision; giữ nguyên số nguyên và NULL.
-- Chạy SQL này trước khi deploy code nhận GSM thập phân.
BEGIN;
ALTER TABLE "production_orders"
  ALTER COLUMN "gsm" TYPE double precision,
  ALTER COLUMN "productionGsm" TYPE double precision,
  ALTER COLUMN "rawFabricGsm" TYPE double precision,
  ALTER COLUMN "coatingGsm" TYPE double precision,
  ALTER COLUMN "finishedGsm" TYPE double precision;
COMMIT;
