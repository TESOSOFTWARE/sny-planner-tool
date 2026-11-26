-- [MoM 30/10 §2, §4] Record partial WIP transfers between adjacent stages.
BEGIN;
CREATE TABLE "production_handoffs" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "fromStage" TEXT NOT NULL,
  "toStage" TEXT NOT NULL,
  "sourceMetricLabel" TEXT NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "unit" VARCHAR(24) NOT NULL,
  "transferredAt" DATE NOT NULL,
  "shift" TEXT NOT NULL,
  "handedOffBy" TEXT NOT NULL,
  "receivedBy" TEXT NOT NULL,
  "note" TEXT,
  "createdByEmail" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedAt" TIMESTAMP(3),
  "voidedByEmail" TEXT,
  "voidReason" TEXT,
  CONSTRAINT "production_handoffs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "production_handoffs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "production_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "production_handoffs_orderId_transferredAt_idx" ON "production_handoffs"("orderId", "transferredAt");
CREATE INDEX "production_handoffs_fromStage_toStage_transferredAt_idx" ON "production_handoffs"("fromStage", "toStage", "transferredAt");
COMMIT;
