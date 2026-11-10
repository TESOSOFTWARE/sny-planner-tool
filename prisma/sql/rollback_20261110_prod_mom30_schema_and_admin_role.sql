-- Destructive rollback guard: preserves existing sny_users/sny_sessions and
-- refuses to drop RBAC or M30 tables once assignments or business data exist.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "sny_user_roles")
     OR EXISTS (SELECT 1 FROM "production_output_plans")
     OR EXISTS (SELECT 1 FROM "production_plan_revisions")
     OR EXISTS (SELECT 1 FROM "manual_production_entries")
     OR EXISTS (SELECT 1 FROM "production_order_attachments") THEN
    RAISE EXCEPTION 'Rollback refused: release data exists. Export and review it before any destructive rollback.';
  END IF;
  IF EXISTS (SELECT 1 FROM "sny_roles" WHERE "name" <> 'Admin' OR NOT "isSystem")
     OR (SELECT count(*) FROM "sny_roles") <> 1
     OR (SELECT count(*) FROM "sny_permissions") <> 31
     OR (SELECT count(*) FROM "sny_role_permissions") <> 31 THEN
    RAISE EXCEPTION 'Rollback refused: role/permission catalog changed after the release migration.';
  END IF;
END $$;

DROP TABLE "production_order_attachments";
DROP TABLE "manual_production_entries";
DROP TABLE "production_plan_revisions";
DROP TABLE "production_output_plans";
DROP TABLE "sny_role_permissions";
DROP TABLE "sny_user_roles";
DROP TABLE "sny_permissions";
DROP TABLE "sny_roles";
COMMIT;
