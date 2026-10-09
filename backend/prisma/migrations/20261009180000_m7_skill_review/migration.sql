-- CreateTable
CREATE TABLE "skill_review_log" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "candidateId" TEXT,
    "skillId" TEXT,
    "targetSkillId" TEXT,
    "actorId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_review_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skill_review_log_createdAt_idx" ON "skill_review_log"("createdAt");

-- CreateIndex
CREATE INDEX "skill_review_log_candidateId_idx" ON "skill_review_log"("candidateId");

