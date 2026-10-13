-- MoM §3.2 — phân loại nhựa nguyên sinh/tái chế và độ bền màu hạt màu (additive).
-- Apply only to a disposable test database during this task. Do not run
-- against the customer database until the deployment is reviewed.
--
-- Phạm vi: 1 enum mới, 2 cột mới đều NULLABLE.
-- KHÔNG sửa dòng dữ liệu nào đang có. Không backfill.
--
-- Vì sao cần tách nguyên sinh/tái chế: file nguồn để hai loại ở hai khối riêng
-- với CÔNG THỨC TỒN KHÁC NHAU — tái chế trừ REJECT, nguyên sinh không.
-- Gộp chung một nhóm là mất khả năng tính đúng tồn kho.
BEGIN;

CREATE TYPE "MaterialSubGroup" AS ENUM ('NGUYEN_SINH', 'TAI_CHE');

ALTER TABLE "materials"
  ADD COLUMN "subGroup" "MaterialSubGroup",
  ADD COLUMN "lightFastness" TEXT;

COMMIT;
