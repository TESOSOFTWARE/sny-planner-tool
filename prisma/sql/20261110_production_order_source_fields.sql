-- [MoM 30/10 §4] Preserve source PO/order fields not previously represented in ProductionOrder.
BEGIN;
ALTER TABLE "production_orders"
  ADD COLUMN "shippingTerms" TEXT,
  ADD COLUMN "paymentTerms" TEXT,
  ADD COLUMN "gaugeDenier" TEXT,
  ADD COLUMN "labelInstruction" TEXT,
  ADD COLUMN "shippingNote" TEXT,
  ADD COLUMN "etdDate" TIMESTAMP(3),
  ADD COLUMN "etdNote" TEXT,
  ADD COLUMN "loadingDate" TIMESTAMP(3),
  ADD COLUMN "loadingDate2" TIMESTAMP(3),
  ADD COLUMN "loadingDateNote" TEXT,
  ADD COLUMN "loadingDate2Note" TEXT;
COMMIT;
