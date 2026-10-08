-- Manual rollback for M1. Not run by Prisma. Drops only objects added by this migration.
ALTER TABLE "skill_alias" DROP CONSTRAINT IF EXISTS "skill_alias_skillId_fkey";
ALTER TABLE "skill_domain" DROP CONSTRAINT IF EXISTS "skill_domain_parentId_fkey";
ALTER TABLE "skill" DROP CONSTRAINT IF EXISTS "skill_domainId_fkey";
DROP INDEX IF EXISTS "skill_domainId_idx";
DROP INDEX IF EXISTS "skill_normalizedName_idx";
DROP TABLE IF EXISTS "intel_config_change";
DROP TABLE IF EXISTS "intel_config";
DROP TABLE IF EXISTS "skill_alias";
DROP TABLE IF EXISTS "skill_domain";
ALTER TABLE "skill" DROP COLUMN IF EXISTS "normalizedName", DROP COLUMN IF EXISTS "domainId";
ALTER TABLE "career_skill_requirement" DROP COLUMN IF EXISTS "source", DROP COLUMN IF EXISTS "sourceRef", DROP COLUMN IF EXISTS "lastSeenAt";
DROP TYPE IF EXISTS "SkillAliasStatus";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261009120000_m1_skill_foundation';
