-- [MoM 30/10 §4] Dynamic role and permission catalog; apply only to approved DB.
BEGIN;
CREATE TABLE "sny_roles" (
 "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL UNIQUE, "description" TEXT,
 "isSystem" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "sny_permissions" (
 "key" TEXT PRIMARY KEY, "label" TEXT NOT NULL, "module" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "sny_user_roles" (
 "userId" TEXT NOT NULL REFERENCES "sny_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "roleId" TEXT NOT NULL REFERENCES "sny_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY("userId","roleId")
);
CREATE INDEX "sny_user_roles_roleId_idx" ON "sny_user_roles"("roleId");
CREATE TABLE "sny_role_permissions" (
 "roleId" TEXT NOT NULL REFERENCES "sny_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "permissionKey" TEXT NOT NULL REFERENCES "sny_permissions"("key") ON DELETE RESTRICT ON UPDATE CASCADE,
 PRIMARY KEY("roleId","permissionKey")
);
CREATE INDEX "sny_role_permissions_permissionKey_idx" ON "sny_role_permissions"("permissionKey");
COMMIT;
