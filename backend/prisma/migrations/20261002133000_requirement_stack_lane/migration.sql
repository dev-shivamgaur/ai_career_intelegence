DROP INDEX IF EXISTS "career_skill_requirement_careerId_skillId_key";

CREATE UNIQUE INDEX "career_skill_requirement_careerId_skillId_stackLane_key"
ON "career_skill_requirement" ("careerId", "skillId", "stackLane");

CREATE INDEX "career_skill_requirement_careerId_stackLane_idx"
ON "career_skill_requirement" ("careerId", "stackLane");
