-- Manual rollback for M5. Not run by Prisma. Drops only objects added by this migration.
DROP TABLE IF EXISTS "market_job_skill";
DROP TYPE IF EXISTS "MarketSkillMethod";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261009160000_m5_market_job_skill';
