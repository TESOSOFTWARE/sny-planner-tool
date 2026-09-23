-- Additive stock-report provenance schema.
-- Apply only to a disposable test database during this task. Do not run
-- against the customer database until the deployment is reviewed.
BEGIN;

ALTER TABLE "materials"
  ADD COLUMN "stockReportDate" DATE,
  ADD COLUMN "stockReportDirty" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "material_report_snapshots" (
  "id" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "reportDate" DATE NOT NULL,
  "payload" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "material_report_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "material_report_snapshots_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "material_report_snapshots_materialId_reportDate_key"
  ON "material_report_snapshots"("materialId", "reportDate");

ALTER TABLE "material_transactions"
  ADD COLUMN "reportSnapshotId" TEXT,
  ADD CONSTRAINT "material_transactions_reportSnapshotId_fkey"
    FOREIGN KEY ("reportSnapshotId") REFERENCES "material_report_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "material_transactions_reportSnapshotId_idx"
  ON "material_transactions"("reportSnapshotId");
CREATE INDEX "material_transactions_materialId_txDate_idx"
  ON "material_transactions"("materialId", "txDate");

COMMIT;
