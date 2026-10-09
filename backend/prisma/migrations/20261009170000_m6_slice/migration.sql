-- CreateEnum
CREATE TYPE "SkillCandidateStatus" AS ENUM ('PENDING', 'APPROVED', 'MAPPED', 'REJECTED', 'MERGED');

-- CreateEnum
CREATE TYPE "MarketClassificationStatus" AS ENUM ('PENDING', 'CLASSIFIED', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "MarketClassifyMethod" AS ENUM ('TITLE_PATTERN', 'SKILL_OVERLAP', 'LLM', 'ADMIN');

-- AlterTable
ALTER TABLE "market_job" ADD COLUMN     "classificationStatus" "MarketClassificationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "classifiedAt" TIMESTAMP(3),
ADD COLUMN     "classifierVersion" TEXT;

-- CreateTable
CREATE TABLE "skill_candidate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "status" "SkillCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "jobCount" INTEGER NOT NULL DEFAULT 0,
    "companyCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "suggestedSkillId" TEXT,
    "suggestionMethod" TEXT,
    "suggestionScore" DOUBLE PRECISION,
    "resolvedSkillId" TEXT,
    "autoApproved" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_career_profile" (
    "id" TEXT NOT NULL,
    "careerId" TEXT NOT NULL,
    "titlePatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludePatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_career_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_job_career" (
    "id" TEXT NOT NULL,
    "marketJobId" TEXT NOT NULL,
    "careerId" TEXT NOT NULL,
    "laneKey" TEXT NOT NULL DEFAULT 'all',
    "confidence" DOUBLE PRECISION NOT NULL,
    "method" "MarketClassifyMethod" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "matchedPattern" TEXT,
    "classifierVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_job_career_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skill_candidate_normalizedName_key" ON "skill_candidate"("normalizedName");

-- CreateIndex
CREATE INDEX "skill_candidate_status_jobCount_idx" ON "skill_candidate"("status", "jobCount");

-- CreateIndex
CREATE UNIQUE INDEX "market_career_profile_careerId_key" ON "market_career_profile"("careerId");

-- CreateIndex
CREATE INDEX "market_job_career_careerId_laneKey_idx" ON "market_job_career"("careerId", "laneKey");

-- CreateIndex
CREATE UNIQUE INDEX "market_job_career_marketJobId_careerId_laneKey_key" ON "market_job_career"("marketJobId", "careerId", "laneKey");

-- CreateIndex
CREATE INDEX "market_job_classificationStatus_idx" ON "market_job"("classificationStatus");

-- AddForeignKey
ALTER TABLE "skill_candidate" ADD CONSTRAINT "skill_candidate_suggestedSkillId_fkey" FOREIGN KEY ("suggestedSkillId") REFERENCES "skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_candidate" ADD CONSTRAINT "skill_candidate_resolvedSkillId_fkey" FOREIGN KEY ("resolvedSkillId") REFERENCES "skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_career_profile" ADD CONSTRAINT "market_career_profile_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "career"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_job_career" ADD CONSTRAINT "market_job_career_marketJobId_fkey" FOREIGN KEY ("marketJobId") REFERENCES "market_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_job_career" ADD CONSTRAINT "market_job_career_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "career"("id") ON DELETE CASCADE ON UPDATE CASCADE;

