-- Manual rollback for M10. Not run by Prisma. Drops only objects added by this migration.
DROP TABLE IF EXISTS "skill_trend";
DROP TYPE IF EXISTS "SkillTrendLabel";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261009200000_m10_trends';
