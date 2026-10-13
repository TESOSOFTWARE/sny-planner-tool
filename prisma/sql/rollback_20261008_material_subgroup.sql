-- Rollback for 20261008_material_subgroup.sql
-- Safely reverses schema additions in reverse dependency order.
-- Target environment: Test DB only.
--
-- Mất dữ liệu: phân loại nguyên sinh/tái chế và độ bền màu đã nhập sẽ mất.
-- Không ảnh hưởng tên, tồn kho hay giao dịch của vật tư.
BEGIN;

ALTER TABLE "materials"
  DROP COLUMN IF EXISTS "lightFastness",
  DROP COLUMN IF EXISTS "subGroup";

DROP TYPE IF EXISTS "MaterialSubGroup";

COMMIT;
