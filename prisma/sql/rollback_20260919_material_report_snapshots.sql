-- Rollback for 20260919_material_report_snapshots.sql
-- Safely reverses schema additions in reverse dependency order.
-- Target environment: Test DB only.

BEGIN;

-- 1. Drop foreign key constraint, indexes, and column from material_transactions
ALTER TABLE "material_transactions"
  DROP CONSTRAINT IF EXISTS "material_transactions_reportSnapshotId_fkey";

DROP INDEX IF EXISTS "material_transactions_reportSnapshotId_idx";
DROP INDEX IF EXISTS "material_transactions_materialId_txDate_idx";

ALTER TABLE "material_transactions"
  DROP COLUMN IF EXISTS "reportSnapshotId";

-- 2. Drop table material_report_snapshots
DROP TABLE IF EXISTS "material_report_snapshots";

-- 3. Drop added columns from materials
ALTER TABLE "materials"
  DROP COLUMN IF EXISTS "stockReportDate",
  DROP COLUMN IF EXISTS "stockReportDirty";

COMMIT;
