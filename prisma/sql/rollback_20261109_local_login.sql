-- Remove application auth code before applying; discards local accounts/sessions.
BEGIN;
DROP TABLE "sny_role_permissions";
DROP TABLE "sny_user_roles";
DROP TABLE "sny_permissions";
DROP TABLE "sny_roles";
DROP TABLE "sny_sessions";
DROP TABLE "sny_users";
COMMIT;
