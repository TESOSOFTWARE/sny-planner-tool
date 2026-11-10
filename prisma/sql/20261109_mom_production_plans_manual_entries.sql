-- [MoM 30/10 §4] Keep plans and manually entered actuals separate from imported report models.
BEGIN;
CREATE TABLE "production_output_plans" (
  "id" TEXT PRIMARY KEY,
  "stage" TEXT NOT NULL,
  "planDate" TIMESTAMP(3) NOT NULL,
  "machineId" TEXT,
  "shift" TEXT,
  "orderRef" TEXT,
  "orderId" TEXT REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "color" TEXT,
  "metricLabel" TEXT NOT NULL,
  "plannedValue" DECIMAL(12,2) NOT NULL,
  "unit" TEXT NOT NULL,
  "note" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "production_output_plans_stage_planDate_idx" ON "production_output_plans"("stage", "planDate");
CREATE INDEX "production_output_plans_orderRef_idx" ON "production_output_plans"("orderRef");
CREATE INDEX "production_output_plans_orderId_idx" ON "production_output_plans"("orderId");
CREATE TABLE "production_plan_revisions" (
  "id" TEXT PRIMARY KEY,
  "planId" TEXT NOT NULL REFERENCES "production_output_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("planId", "revision")
);
CREATE INDEX "production_plan_revisions_createdAt_idx" ON "production_plan_revisions"("createdAt");

CREATE TABLE "manual_production_entries" (
  "id" TEXT PRIMARY KEY,
  "stage" TEXT NOT NULL,
  "reportDate" TIMESTAMP(3) NOT NULL,
  "machineId" TEXT,
  "shift" TEXT,
  "orderRef" TEXT,
  "orderId" TEXT REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "color" TEXT,
  "metricLabel" TEXT NOT NULL,
  "metricValue" DECIMAL(12,2) NOT NULL,
  "unit" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "manual_production_entries_stage_reportDate_idx" ON "manual_production_entries"("stage", "reportDate");
CREATE INDEX "manual_production_entries_orderRef_idx" ON "manual_production_entries"("orderRef");
CREATE INDEX "manual_production_entries_orderId_idx" ON "manual_production_entries"("orderId");

CREATE TABLE "production_order_attachments" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "content" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "production_order_attachments_orderId_createdAt_idx" ON "production_order_attachments"("orderId", "createdAt");
COMMIT;
