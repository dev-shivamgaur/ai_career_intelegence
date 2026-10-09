-- Manual rollback for M3. Not run by Prisma. Drops only objects added by this migration.
DROP TABLE IF EXISTS "market_raw_job";
DROP TYPE IF EXISTS "MarketProcessingStatus";
DROP TYPE IF EXISTS "MarketListingStatus";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261009140000_m3_raw_ingest';
