-- Remove dev-only FR standard field.
-- Execution intentionally not performed by the agent.
ALTER TABLE "production_orders" DROP COLUMN IF EXISTS "frStandard";
ALTER TABLE "product_color_recipes" DROP COLUMN IF EXISTS "frStandard";
