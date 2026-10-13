-- Rollback for 20261008_factory_calendar.sql
-- Safely reverses schema additions in reverse dependency order.
-- Target environment: Test DB only.
--
-- An toàn: chỉ gỡ thứ migration đã thêm. Không dòng dữ liệu nghiệp vụ nào
-- bị mất, vì cột endDateSource chỉ mang metadata và 2 bảng kia là bảng mới.

BEGIN;

-- 1. Drop indexes and tables added by the migration
DROP INDEX IF EXISTS "factory_calendar_exceptions_date_key";
DROP TABLE IF EXISTS "factory_calendar_exceptions";

DROP INDEX IF EXISTS "factory_calendar_months_yearMonth_key";
DROP TABLE IF EXISTS "factory_calendar_months";

-- 2. Drop added column from machine_assignments
ALTER TABLE "machine_assignments"
  DROP COLUMN IF EXISTS "endDateSource";

-- 3. Drop enum types last — chỉ drop được sau khi mọi cột dùng chúng đã bị gỡ
DROP TYPE IF EXISTS "CalendarExceptionKind";
DROP TYPE IF EXISTS "EndDateSource";

COMMIT;
