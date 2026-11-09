-- Remove application auth code before applying; discards local accounts/sessions.
BEGIN;
DROP TABLE "sny_sessions";
DROP TABLE "sny_users";
COMMIT;
