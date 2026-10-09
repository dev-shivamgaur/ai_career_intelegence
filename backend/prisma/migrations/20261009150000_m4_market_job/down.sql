-- Manual rollback for M4. Not run by Prisma. Drops only objects added by this migration.
ALTER TABLE "market_raw_job" DROP CONSTRAINT IF EXISTS "market_raw_job_marketJobId_fkey";
DROP INDEX IF EXISTS "market_raw_job_marketJobId_idx";
ALTER TABLE "market_raw_job" DROP COLUMN IF EXISTS "marketJobId";
DROP TABLE IF EXISTS "market_job";
DROP TYPE IF EXISTS "MarketEmploymentType";
DROP TYPE IF EXISTS "MarketSeniority";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261009150000_m4_market_job';
