-- [FB 25/11/2026] Preserve stage-specific plan workbook rows and revisions.
-- Local artifact only. Do not apply to a shared or production database here.

BEGIN;

CREATE TABLE IF NOT EXISTS "production_stage_plan_import_batches" (
  "id" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "profile" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileHash" VARCHAR(64) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "summary" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_stage_plan_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "production_stage_plan_import_batches_file_profile_scope_key"
  ON "production_stage_plan_import_batches" ("fileHash", "profile", "scopeKey");
CREATE INDEX IF NOT EXISTS "prod_stage_plan_batch_scope_confirmed_idx"
  ON "production_stage_plan_import_batches" ("stage", "profile", "scopeKey", "confirmedAt");

CREATE TABLE IF NOT EXISTS "production_stage_plan_import_rows" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "sourceKey" VARCHAR(64) NOT NULL,
  "sourceSheet" TEXT NOT NULL,
  "sourceRow" INTEGER NOT NULL,
  "planDate" DATE,
  "machineLabel" TEXT,
  "orderRef" TEXT,
  "displayData" JSONB NOT NULL,
  "warnings" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_stage_plan_import_rows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "production_stage_plan_import_rows_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "production_stage_plan_import_batches"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "production_stage_plan_import_rows_batch_source_key"
  ON "production_stage_plan_import_rows" ("batchId", "sourceKey");
CREATE INDEX IF NOT EXISTS "production_stage_plan_import_rows_batchId_planDate_idx"
  ON "production_stage_plan_import_rows" ("batchId", "planDate");
CREATE INDEX IF NOT EXISTS "production_stage_plan_import_rows_sourceSheet_sourceRow_idx"
  ON "production_stage_plan_import_rows" ("sourceSheet", "sourceRow");

COMMIT;
