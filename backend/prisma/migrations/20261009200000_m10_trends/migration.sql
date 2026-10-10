-- CreateEnum
CREATE TYPE "SkillTrendLabel" AS ENUM ('INCREASING', 'DECREASING', 'EMERGING', 'STABLE', 'INSUFFICIENT_DATA');

-- CreateTable
CREATE TABLE "skill_trend" (
    "id" TEXT NOT NULL,
    "periodType" "MarketPeriodType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "priorPeriodStart" TIMESTAMP(3) NOT NULL,
    "priorPeriodEnd" TIMESTAMP(3) NOT NULL,
    "careerId" TEXT NOT NULL,
    "laneKey" TEXT NOT NULL DEFAULT 'all',
    "skillId" TEXT NOT NULL,
    "skillName" TEXT NOT NULL,
    "methodologyVersion" TEXT NOT NULL,
    "basis" "MarketDemandBasis" NOT NULL DEFAULT 'NEW_POSTINGS',
    "label" "SkillTrendLabel" NOT NULL,
    "panelCompanies" INTEGER NOT NULL,
    "panelSources" INTEGER NOT NULL,
    "jobCount" DOUBLE PRECISION NOT NULL,
    "priorJobCount" DOUBLE PRECISION NOT NULL,
    "totalJobs" DOUBLE PRECISION NOT NULL,
    "priorTotalJobs" DOUBLE PRECISION NOT NULL,
    "share" DOUBLE PRECISION NOT NULL,
    "priorShare" DOUBLE PRECISION NOT NULL,
    "effectPp" DOUBLE PRECISION NOT NULL,
    "relativeGrowth" DOUBLE PRECISION,
    "pValue" DOUBLE PRECISION,
    "adjustedPValue" DOUBLE PRECISION,
    "confirmedSteps" INTEGER NOT NULL DEFAULT 0,
    "companies" INTEGER NOT NULL,
    "priorCompanies" INTEGER NOT NULL,
    "params" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_trend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skill_trend_careerId_laneKey_periodType_periodStart_idx" ON "skill_trend"("careerId", "laneKey", "periodType", "periodStart");

-- CreateIndex
CREATE INDEX "skill_trend_skillId_idx" ON "skill_trend"("skillId");

-- CreateIndex
CREATE INDEX "skill_trend_label_idx" ON "skill_trend"("label");

-- CreateIndex
CREATE UNIQUE INDEX "skill_trend_periodType_periodStart_careerId_laneKey_skillId_key" ON "skill_trend"("periodType", "periodStart", "careerId", "laneKey", "skillId", "methodologyVersion");

