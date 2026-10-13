-- 20261012 — Rollback [FB 12/10 #5] GSM thập phân, card 1210-02.
-- CHƯA CHẠY trên DB dùng chung. Cần backup và duyệt target riêng.
-- CẢNH BÁO: làm tròn và mất phần lẻ đã nhập ở cả 5 cột GSM.
-- Ví dụ 13.45 -> 13; 13.55 -> 14. Không dùng để phục hồi số lẻ.
BEGIN;
ALTER TABLE "production_orders"
  ALTER COLUMN "gsm" TYPE integer USING round("gsm")::integer,
  ALTER COLUMN "productionGsm" TYPE integer USING round("productionGsm")::integer,
  ALTER COLUMN "rawFabricGsm" TYPE integer USING round("rawFabricGsm")::integer,
  ALTER COLUMN "coatingGsm" TYPE integer USING round("coatingGsm")::integer,
  ALTER COLUMN "finishedGsm" TYPE integer USING round("finishedGsm")::integer;
COMMIT;
