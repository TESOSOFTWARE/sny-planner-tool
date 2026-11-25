-- [MoM 30/10 §4; FB 19/11/2026] Append-only audit of Statistical Report workbook versions.
-- Create this table before deploying code that reads ProductionReportImportBatch.
-- Do not run against production without separate approval and backup.

CREATE TABLE "production_report_import_batches" (
  "id" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileHash" VARCHAR(64) NOT NULL,
  "decisionHash" VARCHAR(64) NOT NULL,
  "reportMonth" VARCHAR(7) NOT NULL,
  "selectedSheets" JSONB NOT NULL,
  "decisions" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "sheetResults" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'PREPARED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "production_report_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "production_report_import_batches_fileHash_reportMonth_key"
  ON "production_report_import_batches"("fileHash", "reportMonth");

CREATE INDEX "production_report_import_batches_reportMonth_createdAt_idx"
  ON "production_report_import_batches"("reportMonth", "createdAt");

CREATE INDEX "production_report_import_batches_status_createdAt_idx"
  ON "production_report_import_batches"("status", "createdAt");

CREATE TABLE "production_report_import_sheets" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "sheetName" TEXT NOT NULL,
  "sourceRows" JSONB NOT NULL,
  "attemptToken" VARCHAR(64),
  "attemptCommittedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PREPARED',
  "result" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "production_report_import_sheets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "production_report_import_sheets_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "production_report_import_batches"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "production_report_import_sheets_batchId_sheetName_key"
  ON "production_report_import_sheets"("batchId", "sheetName");

CREATE INDEX "production_report_import_sheets_sheetName_createdAt_idx"
  ON "production_report_import_sheets"("sheetName", "createdAt");
