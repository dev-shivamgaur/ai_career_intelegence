-- Manual rollback. Drops only objects added by 20261015120000_learner_evidence.
DROP TABLE IF EXISTS "learning_resource";
DROP TABLE IF EXISTS "personalized_roadmap_task";
DROP TABLE IF EXISTS "personalized_roadmap";
DROP TABLE IF EXISTS "skill_relation";
DROP TABLE IF EXISTS "github_repo_link";
DROP TABLE IF EXISTS "skill_evidence_summary";
DROP TABLE IF EXISTS "skill_evidence";
DROP TYPE IF EXISTS "LearningResourceKind";
DROP TYPE IF EXISTS "SkillRelationKind";
DROP TYPE IF EXISTS "EvidenceClaim";
DROP TYPE IF EXISTS "EvidenceQuality";
DROP TYPE IF EXISTS "EvidenceSource";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261015120000_learner_evidence';
