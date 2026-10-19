-- [1510-06 R8] Stop/roll back the new application BEFORE dropping this column.
-- Dropping meshType discards its values. No shared/prod execution without approval.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "knitting_daily_detail" DROP COLUMN "meshType";
COMMIT;
