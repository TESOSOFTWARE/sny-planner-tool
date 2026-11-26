-- Export production_handoffs before rollback; this removes all WIP transfer history.
BEGIN;
DROP TABLE IF EXISTS "production_handoffs";
COMMIT;
