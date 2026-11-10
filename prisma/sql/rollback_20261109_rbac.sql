-- Drops RBAC assignments/catalog; requires explicit backup and target approval.
BEGIN;
DROP TABLE "sny_role_permissions";
DROP TABLE "sny_user_roles";
DROP TABLE "sny_permissions";
DROP TABLE "sny_roles";
COMMIT;
