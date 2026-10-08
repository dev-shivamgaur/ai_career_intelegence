-- Manual rollback is intentionally not provided for the drift repair: on existing databases the
-- objects pre-date this migration and the application depends on them. Roll back by restoring the
-- M0.2 pg_dump if ever required.
SELECT 1;
