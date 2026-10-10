-- Manual rollback for M9. Not run by Prisma. Drops only objects added by this migration.
DROP TABLE IF EXISTS "market_skill_snapshot";
DROP TABLE IF EXISTS "market_career_snapshot";
DROP TABLE IF EXISTS "market_panel_membership";
DROP TYPE IF EXISTS "MarketDemandBasis";
DROP TYPE IF EXISTS "MarketPeriodType";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261009190000_m9_demand';
