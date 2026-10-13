-- Rollback for 20261008_seed_vn_holidays_2027.sql
-- Target environment: Test DB only.
--
-- Chỉ xoá đúng 4 dòng do seed tạo ra (nhận diện bằng id có tiền tố seed_vn_2027_).
-- Ngày nghỉ do người dùng tự đánh dấu trên màn Schedule dùng cuid() nên không bị đụng.
BEGIN;

DELETE FROM "factory_calendar_exceptions"
  WHERE "id" LIKE 'seed_vn_2027_%';

COMMIT;
