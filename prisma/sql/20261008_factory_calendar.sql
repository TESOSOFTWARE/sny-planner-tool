-- P01 — Lịch nghỉ nhà máy dùng chung (additive).
-- Apply only to a disposable test database during this task. Do not run
-- against the customer database until the deployment is reviewed.
--
-- Phạm vi: 2 bảng mới, 2 enum mới, 1 cột mới có DEFAULT.
-- KHÔNG sửa dòng dữ liệu nào đang có. Không backfill.
BEGIN;

CREATE TYPE "EndDateSource" AS ENUM ('MANUAL', 'COMPUTED', 'IMPORTED');
CREATE TYPE "CalendarExceptionKind" AS ENUM ('HOLIDAY', 'CLOSURE', 'MAKEUP');

-- 115 dòng hiện có nhận 'MANUAL': giá trị bảo thủ nhất, hệ thống không tự đổi
-- ngày kết thúc của lịch cũ khi cấu hình lịch nghỉ thay đổi.
ALTER TABLE "machine_assignments"
  ADD COLUMN "endDateSource" "EndDateSource" NOT NULL DEFAULT 'MANUAL';

CREATE TABLE "factory_calendar_months" (
  "id"                 TEXT NOT NULL,
  "yearMonth"          TEXT NOT NULL,
  -- Prisma map scalar list sang INTEGER[] KHÔNG kèm NOT NULL; giữ đúng vậy
  -- để không lệch datamodel khi chạy migrate diff về sau.
  "nonWorkingWeekdays" INTEGER[],
  "note"               TEXT,
  "updatedBy"          TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "factory_calendar_months_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "factory_calendar_months_yearMonth_key"
  ON "factory_calendar_months" ("yearMonth");

CREATE TABLE "factory_calendar_exceptions" (
  "id"        TEXT NOT NULL,
  "date"      DATE NOT NULL,
  "isWorking" BOOLEAN NOT NULL,
  "kind"      "CalendarExceptionKind" NOT NULL,
  "note"      TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "factory_calendar_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "factory_calendar_exceptions_date_key"
  ON "factory_calendar_exceptions" ("date");

COMMIT;
