-- Manual rollback for M6. Not run by Prisma. Drops only objects added by this migration.
DROP TABLE IF EXISTS "market_job_career";
DROP TABLE IF EXISTS "market_career_profile";
DROP TABLE IF EXISTS "skill_candidate";
DROP INDEX IF EXISTS "market_job_classificationStatus_idx";
ALTER TABLE "market_job" DROP COLUMN IF EXISTS "classificationStatus", DROP COLUMN IF EXISTS "classifiedAt", DROP COLUMN IF EXISTS "classifierVersion";
DROP TYPE IF EXISTS "MarketClassifyMethod";
DROP TYPE IF EXISTS "MarketClassificationStatus";
DROP TYPE IF EXISTS "SkillCandidateStatus";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261009170000_m6_slice';
