-- Export affected production_orders rows before rollback; this drops the new source fields.
BEGIN;
ALTER TABLE "production_orders"
  DROP COLUMN "shippingTerms",
  DROP COLUMN "paymentTerms",
  DROP COLUMN "gaugeDenier",
  DROP COLUMN "labelInstruction",
  DROP COLUMN "shippingNote",
  DROP COLUMN "etdDate",
  DROP COLUMN "etdNote",
  DROP COLUMN "loadingDate",
  DROP COLUMN "loadingDate2",
  DROP COLUMN "loadingDateNote",
  DROP COLUMN "loadingDate2Note";
COMMIT;
