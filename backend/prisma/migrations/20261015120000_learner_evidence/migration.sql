-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM ('RESUME', 'PROJECT', 'ASSESSMENT', 'GITHUB', 'MANUAL');

-- CreateEnum
CREATE TYPE "EvidenceQuality" AS ENUM ('MENTIONED', 'DEMONSTRATED', 'ASSESSED');

-- CreateEnum
CREATE TYPE "EvidenceClaim" AS ENUM ('CLAIMED', 'SUPPORTED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "SkillRelationKind" AS ENUM ('PREREQUISITE');

-- CreateEnum
CREATE TYPE "LearningResourceKind" AS ENUM ('DOC', 'TUTORIAL', 'PRACTICE');

-- CreateTable
CREATE TABLE "skill_evidence" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "source" "EvidenceSource" NOT NULL,
    "sourceRef" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quality" "EvidenceQuality" NOT NULL,
    "signal" TEXT,
    "current" BOOLEAN NOT NULL DEFAULT true,
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_evidence_summary" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "status" "EvidenceClaim" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_evidence_summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_repo_link" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastScannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_repo_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_relation" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "relatedSkillId" TEXT NOT NULL,
    "kind" "SkillRelationKind" NOT NULL DEFAULT 'PREREQUISITE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_relation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personalized_roadmap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "careerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personalized_roadmap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personalized_roadmap_task" (
    "id" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "skillId" TEXT,
    "title" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "foundational" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personalized_roadmap_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_resource" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" "LearningResourceKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_resource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skill_evidence_profileId_skillId_current_idx" ON "skill_evidence"("profileId", "skillId", "current");

-- CreateIndex
CREATE INDEX "skill_evidence_profileId_source_idx" ON "skill_evidence"("profileId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "skill_evidence_summary_profileId_skillId_key" ON "skill_evidence_summary"("profileId", "skillId");

-- CreateIndex
CREATE INDEX "github_repo_link_profileId_idx" ON "github_repo_link"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "github_repo_link_profileId_owner_repo_key" ON "github_repo_link"("profileId", "owner", "repo");

-- CreateIndex
CREATE INDEX "skill_relation_skillId_idx" ON "skill_relation"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "skill_relation_skillId_relatedSkillId_kind_key" ON "skill_relation"("skillId", "relatedSkillId", "kind");

-- CreateIndex
CREATE INDEX "personalized_roadmap_userId_idx" ON "personalized_roadmap"("userId");

-- CreateIndex
CREATE INDEX "personalized_roadmap_task_roadmapId_idx" ON "personalized_roadmap_task"("roadmapId");

-- CreateIndex
CREATE INDEX "learning_resource_skillId_active_idx" ON "learning_resource"("skillId", "active");

-- AddForeignKey
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_evidence_summary" ADD CONSTRAINT "skill_evidence_summary_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_evidence_summary" ADD CONSTRAINT "skill_evidence_summary_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_repo_link" ADD CONSTRAINT "github_repo_link_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_relation" ADD CONSTRAINT "skill_relation_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_relation" ADD CONSTRAINT "skill_relation_relatedSkillId_fkey" FOREIGN KEY ("relatedSkillId") REFERENCES "skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personalized_roadmap" ADD CONSTRAINT "personalized_roadmap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personalized_roadmap" ADD CONSTRAINT "personalized_roadmap_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "career"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personalized_roadmap_task" ADD CONSTRAINT "personalized_roadmap_task_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "personalized_roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_resource" ADD CONSTRAINT "learning_resource_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

