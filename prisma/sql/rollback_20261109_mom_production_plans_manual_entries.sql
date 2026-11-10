-- Rollback only after exporting any plan/manual-entry data created after migration.
BEGIN;
DROP TABLE IF EXISTS "production_order_attachments";
DROP TABLE IF EXISTS "manual_production_entries";
DROP TABLE IF EXISTS "production_plan_revisions";
DROP TABLE IF EXISTS "production_output_plans";
COMMIT;
