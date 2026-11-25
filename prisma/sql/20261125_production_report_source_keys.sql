-- [FB 25/11/2026] Add nullable source identities for row-level report upserts.
-- Local artifact only. Do not apply to any shared or production database here.

BEGIN;

ALTER TABLE "extruder_daily_output" ADD COLUMN IF NOT EXISTS "sourceKey" VARCHAR(64);
ALTER TABLE "warping_daily_output" ADD COLUMN IF NOT EXISTS "sourceKey" VARCHAR(64);
ALTER TABLE "knitting_daily_detail" ADD COLUMN IF NOT EXISTS "sourceKey" VARCHAR(64);
ALTER TABLE "rolling_daily_metrics" ADD COLUMN IF NOT EXISTS "sourceKey" VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS "extruder_daily_output_sourceKey_key"
  ON "extruder_daily_output" ("sourceKey");
CREATE UNIQUE INDEX IF NOT EXISTS "warping_daily_output_sourceKey_key"
  ON "warping_daily_output" ("sourceKey");
CREATE UNIQUE INDEX IF NOT EXISTS "knitting_daily_detail_sourceKey_key"
  ON "knitting_daily_detail" ("sourceKey");
CREATE UNIQUE INDEX IF NOT EXISTS "rolling_daily_metrics_sourceKey_key"
  ON "rolling_daily_metrics" ("sourceKey");

COMMIT;
