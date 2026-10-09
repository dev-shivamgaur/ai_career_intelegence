-- Manual rollback for M2. Not run by Prisma. Drops only objects added by this migration.
DROP TABLE IF EXISTS "market_task";
DROP TABLE IF EXISTS "market_run";
DROP TABLE IF EXISTS "market_source";
DROP TABLE IF EXISTS "company";
DROP TYPE IF EXISTS "MarketTaskStatus";
DROP TYPE IF EXISTS "MarketRunStatus";
DROP TYPE IF EXISTS "MarketTrigger";
DROP TYPE IF EXISTS "MarketRunKind";
DROP TYPE IF EXISTS "RobotsStatus";
DROP TYPE IF EXISTS "MarketDisplayPolicy";
DROP TYPE IF EXISTS "MarketSourceType";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261009130000_m2_market_sources';
