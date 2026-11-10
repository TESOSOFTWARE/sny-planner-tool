-- [MoM 30/10 §4] One-time production Admin account for customer testing.
-- Apply only after 20261110_prod_mom30_schema_and_admin_role.sql and approved PG18 backup.
-- The password is random and stored only as the application's scrypt hash.
-- Refuses to overwrite an existing account or use an incomplete Admin role.
BEGIN;

DO $$
DECLARE
  admin_role_id TEXT;
BEGIN
  IF current_setting('server_version_num')::INTEGER < 180000
     OR current_setting('server_version_num')::INTEGER >= 190000 THEN
    RAISE EXCEPTION 'Expected PostgreSQL 18; stop and verify the approved production target.';
  END IF;

  IF to_regclass('public.sny_users') IS NULL
     OR to_regclass('public.sny_sessions') IS NULL
     OR to_regclass('public.sny_roles') IS NULL
     OR to_regclass('public.sny_permissions') IS NULL
     OR to_regclass('public.sny_user_roles') IS NULL
     OR to_regclass('public.sny_role_permissions') IS NULL THEN
    RAISE EXCEPTION 'Auth/RBAC release schema is incomplete; apply the approved release bundle first.';
  END IF;

  IF EXISTS (SELECT 1 FROM "sny_users" WHERE "email" = 'admin@gmail.com') THEN
    RAISE EXCEPTION 'admin@gmail.com already exists; refusing to reset its password or change its access.';
  END IF;

  SELECT "id" INTO admin_role_id
    FROM "sny_roles"
   WHERE "name" = 'Admin' AND "isSystem" = true;
  IF admin_role_id IS NULL THEN
    RAISE EXCEPTION 'System Admin role is missing; apply the approved release bundle first.';
  END IF;

  IF (SELECT count(*) FROM "sny_permissions") <> 31
     OR (SELECT count(*) FROM "sny_role_permissions" WHERE "roleId" = admin_role_id) <> 31
     OR EXISTS (
       SELECT 1 FROM "sny_permissions" p
        WHERE NOT EXISTS (
          SELECT 1 FROM "sny_role_permissions" rp
           WHERE rp."roleId" = admin_role_id AND rp."permissionKey" = p."key"
        )
     ) THEN
    RAISE EXCEPTION 'Admin role does not have the complete 31-permission catalog; stop and inspect.';
  END IF;
END $$;

INSERT INTO "sny_users" ("id", "email", "passwordHash", "failedAttempts", "lockedUntil", "createdAt")
VALUES (
  'sny-admin-gmail-prod-20261110',
  'admin@gmail.com',
  'scrypt:5ec14f1b4dbbc567e60de91666d576c2:d999210fb8ccd20fd3f261940e232397de1986d5e363ca606071381b1f80123e088a573a7b6943256fe5038df73f15e7d679826ec3cb1f44891b9018e4995f5b',
  0,
  NULL,
  CURRENT_TIMESTAMP
);

INSERT INTO "sny_user_roles" ("userId", "roleId", "assignedAt")
VALUES ('sny-admin-gmail-prod-20261110', 'sny-system-admin-prod', CURRENT_TIMESTAMP);

COMMIT;
