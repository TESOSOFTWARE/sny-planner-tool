-- Guarded rollback for 20261110_prod_admin_account.sql.
-- Refuses to remove a changed account, extra role assignments, or existing sessions.
BEGIN;

DO $$
DECLARE
  admin_id TEXT;
BEGIN
  SELECT "id" INTO admin_id
    FROM "sny_users"
   WHERE "email" = 'admin@gmail.com';
  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'admin@gmail.com not found; nothing to roll back.';
  END IF;

  IF admin_id <> 'sny-admin-gmail-prod-20261110'
     OR (SELECT "passwordHash" FROM "sny_users" WHERE "id" = admin_id) <>
       'scrypt:5ec14f1b4dbbc567e60de91666d576c2:d999210fb8ccd20fd3f261940e232397de1986d5e363ca606071381b1f80123e088a573a7b6943256fe5038df73f15e7d679826ec3cb1f44891b9018e4995f5b' THEN
    RAISE EXCEPTION 'Admin account was changed after migration; refusing to remove it.';
  END IF;

  IF EXISTS (SELECT 1 FROM "sny_sessions" WHERE "userId" = admin_id)
     OR EXISTS (SELECT 1 FROM "sny_user_roles" WHERE "userId" = admin_id AND "roleId" <> 'sny-system-admin-prod') THEN
    RAISE EXCEPTION 'Admin account has sessions or additional roles; revoke/review them before rollback.';
  END IF;
END $$;

DELETE FROM "sny_user_roles"
 WHERE "userId" = 'sny-admin-gmail-prod-20261110'
   AND "roleId" = 'sny-system-admin-prod';
DELETE FROM "sny_users"
 WHERE "id" = 'sny-admin-gmail-prod-20261110'
   AND "email" = 'admin@gmail.com';

COMMIT;
