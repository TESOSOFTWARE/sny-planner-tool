-- [MoM 30/10 §4] Production release schema for existing email/password auth,
-- RBAC and M30 output features. Requires existing sny_users/sny_sessions and
-- production_orders. This bundle replaces 20261109_rbac.sql and
-- 20261109_mom_production_plans_manual_entries.sql for this production rollout;
-- do not run those two separately. It does not replace local_login.sql.
-- Never creates a user or stores a password.
-- Apply only after PostgreSQL 18 backup and preflight. Create the dedicated
-- account using scripts/bootstrap-production-admin.ts after this commits.
BEGIN;

DO $$
DECLARE
  existing_tables TEXT[];
BEGIN
  IF current_setting('server_version_num')::INTEGER < 180000
     OR current_setting('server_version_num')::INTEGER >= 190000 THEN
    RAISE EXCEPTION 'Expected PostgreSQL 18; stop and verify the approved production target.';
  END IF;

  IF to_regclass('public.production_orders') IS NULL
     OR to_regclass('public.sny_users') IS NULL
     OR to_regclass('public.sny_sessions') IS NULL THEN
    RAISE EXCEPTION 'Expected baseline production_orders, sny_users and sny_sessions; stop and inspect the target database.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (VALUES
        ('production_orders', 'id'),
        ('sny_users', 'id'), ('sny_users', 'email'), ('sny_users', 'passwordHash'),
        ('sny_users', 'failedAttempts'), ('sny_users', 'lockedUntil'), ('sny_users', 'createdAt'),
        ('sny_sessions', 'tokenHash'), ('sny_sessions', 'userId'), ('sny_sessions', 'expiresAt')
      ) AS required(table_name, column_name)
     WHERE NOT EXISTS (
       SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = required.table_name
          AND c.column_name = required.column_name
     )
  ) THEN
    RAISE EXCEPTION 'Baseline schema columns do not match the approved login/order release; stop and inspect.';
  END IF;

  SELECT array_agg(t.table_name)
    INTO existing_tables
    FROM unnest(ARRAY[
      'sny_roles', 'sny_permissions',
      'sny_user_roles', 'sny_role_permissions', 'production_output_plans',
      'production_plan_revisions', 'manual_production_entries', 'production_order_attachments'
    ]) AS t(table_name)
   WHERE to_regclass(format('public.%I', t.table_name)) IS NOT NULL;

  IF existing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Some release tables already exist (%); do not re-run or mix migration bundles.', array_to_string(existing_tables, ', ');
  END IF;
END $$;

CREATE TABLE "sny_roles" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "sny_permissions" (
  "key" TEXT PRIMARY KEY,
  "label" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "sny_user_roles" (
  "userId" TEXT NOT NULL REFERENCES "sny_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "roleId" TEXT NOT NULL REFERENCES "sny_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "roleId")
);
CREATE INDEX "sny_user_roles_roleId_idx" ON "sny_user_roles"("roleId");
CREATE TABLE "sny_role_permissions" (
  "roleId" TEXT NOT NULL REFERENCES "sny_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "permissionKey" TEXT NOT NULL REFERENCES "sny_permissions"("key") ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY ("roleId", "permissionKey")
);
CREATE INDEX "sny_role_permissions_permissionKey_idx" ON "sny_role_permissions"("permissionKey");

CREATE TABLE "production_output_plans" (
  "id" TEXT PRIMARY KEY,
  "stage" TEXT NOT NULL,
  "planDate" TIMESTAMP(3) NOT NULL,
  "machineId" TEXT,
  "shift" TEXT,
  "orderRef" TEXT,
  "orderId" TEXT REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "color" TEXT,
  "metricLabel" TEXT NOT NULL,
  "plannedValue" DECIMAL(12,2) NOT NULL,
  "unit" TEXT NOT NULL,
  "note" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "production_output_plans_stage_planDate_idx" ON "production_output_plans"("stage", "planDate");
CREATE INDEX "production_output_plans_orderRef_idx" ON "production_output_plans"("orderRef");
CREATE INDEX "production_output_plans_orderId_idx" ON "production_output_plans"("orderId");

CREATE TABLE "production_plan_revisions" (
  "id" TEXT PRIMARY KEY,
  "planId" TEXT NOT NULL REFERENCES "production_output_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("planId", "revision")
);
CREATE INDEX "production_plan_revisions_createdAt_idx" ON "production_plan_revisions"("createdAt");

CREATE TABLE "manual_production_entries" (
  "id" TEXT PRIMARY KEY,
  "stage" TEXT NOT NULL,
  "reportDate" TIMESTAMP(3) NOT NULL,
  "machineId" TEXT,
  "shift" TEXT,
  "orderRef" TEXT,
  "orderId" TEXT REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "color" TEXT,
  "metricLabel" TEXT NOT NULL,
  "metricValue" DECIMAL(12,2) NOT NULL,
  "unit" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "manual_production_entries_stage_reportDate_idx" ON "manual_production_entries"("stage", "reportDate");
CREATE INDEX "manual_production_entries_orderRef_idx" ON "manual_production_entries"("orderRef");
CREATE INDEX "manual_production_entries_orderId_idx" ON "manual_production_entries"("orderId");

CREATE TABLE "production_order_attachments" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "content" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "production_order_attachments_orderId_createdAt_idx" ON "production_order_attachments"("orderId", "createdAt");

INSERT INTO "sny_permissions" ("key", "label", "module") VALUES
  ('orders.read', 'Xem Production Orders', 'orders'),
  ('orders.create', 'Tạo đơn', 'orders'),
  ('orders.update', 'Sửa đơn', 'orders'),
  ('orders.approve', 'Chốt đơn', 'orders'),
  ('orders.delete', 'Xóa đơn', 'orders'),
  ('orders.import', 'Nhập Excel đơn', 'orders'),
  ('customers.read', 'Xem khách hàng', 'customers'),
  ('customers.create', 'Tạo khách hàng', 'customers'),
  ('customers.update', 'Sửa khách hàng', 'customers'),
  ('customers.delete', 'Xóa khách hàng', 'customers'),
  ('schedule.read', 'Xem lịch máy', 'schedule'),
  ('schedule.assign', 'Xếp máy', 'schedule'),
  ('schedule.update', 'Sửa/chuyển lịch', 'schedule'),
  ('schedule.remove', 'Gỡ lịch', 'schedule'),
  ('schedule.import', 'Nhập lịch', 'schedule'),
  ('schedule.calendar.manage', 'Sửa lịch nghỉ', 'schedule'),
  ('output.read', 'Xem sản lượng', 'output'),
  ('output.plan.create', 'Tạo kế hoạch sản xuất', 'output'),
  ('output.plan.update', 'Sửa kế hoạch sản xuất', 'output'),
  ('output.actual.import', 'Nhập sản lượng Excel', 'output'),
  ('output.actual.enter', 'Nhập sản lượng trực tiếp', 'output'),
  ('output.link.resolve', 'Gắn sản lượng với item', 'output'),
  ('output.print', 'In lịch sản xuất', 'output'),
  ('materials.read', 'Xem nguyên liệu/tồn', 'materials'),
  ('materials.stock.update', 'Sửa tồn nguyên liệu', 'materials'),
  ('materials.transaction.manage', 'Quản lý giao dịch kho', 'materials'),
  ('materials.import.confirm', 'Xác nhận nhập báo cáo kho', 'materials'),
  ('reports.read', 'Xem báo cáo thống kê', 'reports'),
  ('reports.print', 'In báo cáo', 'reports'),
  ('access.users.manage', 'Quản lý tài khoản và gán vai trò', 'access'),
  ('access.roles.manage', 'Tạo/sửa vai trò và quyền', 'access');

INSERT INTO "sny_roles" ("id", "name", "description", "isSystem", "updatedAt")
VALUES ('sny-system-admin-prod', 'Admin', 'Quản trị hệ thống; bootstrap account riêng cho khách test.', true, CURRENT_TIMESTAMP);

INSERT INTO "sny_role_permissions" ("roleId", "permissionKey")
SELECT 'sny-system-admin-prod', "key" FROM "sny_permissions";

COMMIT;
