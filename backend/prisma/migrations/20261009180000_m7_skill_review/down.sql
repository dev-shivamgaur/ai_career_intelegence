-- Manual rollback for M7. Not run by Prisma. Drops only objects added by this migration.
DROP TABLE IF EXISTS "skill_review_log";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261009180000_m7_skill_review';
