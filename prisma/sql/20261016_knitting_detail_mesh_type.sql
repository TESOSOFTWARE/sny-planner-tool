-- [1510-06 R8] Run BEFORE deploying code that selects meshType.
-- Shared/prod execution requires separate owner approval. No data backfill.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "knitting_daily_detail" ADD COLUMN "meshType" TEXT;
COMMIT;
