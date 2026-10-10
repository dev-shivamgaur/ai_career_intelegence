-- CreateEnum
CREATE TYPE "MarketPeriodType" AS ENUM ('WEEK', 'MONTH');

-- CreateEnum
CREATE TYPE "MarketDemandBasis" AS ENUM ('NEW_POSTINGS', 'ACTIVE_STOCK');

-- CreateTable
CREATE TABLE "market_panel_membership" (
    "id" TEXT NOT NULL,
    "periodType" "MarketPeriodType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "sourceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "successfulFetches" INTEGER NOT NULL,
    "firstSuccessAt" TIMESTAMP(3) NOT NULL,
    "lastSuccessAt" TIMESTAMP(3) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_panel_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_career_snapshot" (
    "id" TEXT NOT NULL,
    "periodType" "MarketPeriodType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "basis" "MarketDemandBasis" NOT NULL,
    "careerId" TEXT NOT NULL,
    "laneKey" TEXT NOT NULL DEFAULT 'all',
    "methodologyVersion" TEXT NOT NULL,
    "isComplete" BOOLEAN NOT NULL,
    "totalJobs" INTEGER NOT NULL,
    "cappedTotal" DOUBLE PRECISION NOT NULL,
    "companyCount" INTEGER NOT NULL,
    "capJobs" INTEGER NOT NULL,
    "panelSources" INTEGER NOT NULL,
    "panelCompanies" INTEGER NOT NULL,
    "params" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_career_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_skill_snapshot" (
    "id" TEXT NOT NULL,
    "periodType" "MarketPeriodType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "basis" "MarketDemandBasis" NOT NULL,
    "careerId" TEXT NOT NULL,
    "laneKey" TEXT NOT NULL DEFAULT 'all',
    "skillId" TEXT NOT NULL,
    "skillName" TEXT NOT NULL,
    "methodologyVersion" TEXT NOT NULL,
    "isComplete" BOOLEAN NOT NULL,
    "jobCount" INTEGER NOT NULL,
    "requiredCount" INTEGER NOT NULL,
    "preferredCount" INTEGER NOT NULL,
    "niceCount" INTEGER NOT NULL,
    "companyCount" INTEGER NOT NULL,
    "cappedJobCount" DOUBLE PRECISION NOT NULL,
    "totalJobs" INTEGER NOT NULL,
    "cappedTotal" DOUBLE PRECISION NOT NULL,
    "demandPct" DOUBLE PRECISION NOT NULL,
    "wilsonLower" DOUBLE PRECISION NOT NULL,
    "wilsonUpper" DOUBLE PRECISION NOT NULL,
    "panelCompanies" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_skill_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "market_panel_membership_periodType_periodStart_idx" ON "market_panel_membership"("periodType", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "market_panel_membership_periodType_periodStart_sourceId_key" ON "market_panel_membership"("periodType", "periodStart", "sourceId");

-- CreateIndex
CREATE INDEX "market_career_snapshot_careerId_laneKey_periodType_basis_pe_idx" ON "market_career_snapshot"("careerId", "laneKey", "periodType", "basis", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "market_career_snapshot_periodType_periodStart_basis_careerI_key" ON "market_career_snapshot"("periodType", "periodStart", "basis", "careerId", "laneKey", "methodologyVersion");

-- CreateIndex
CREATE INDEX "market_skill_snapshot_careerId_laneKey_periodType_basis_per_idx" ON "market_skill_snapshot"("careerId", "laneKey", "periodType", "basis", "periodStart");

-- CreateIndex
CREATE INDEX "market_skill_snapshot_skillId_idx" ON "market_skill_snapshot"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "market_skill_snapshot_periodType_periodStart_basis_careerId_key" ON "market_skill_snapshot"("periodType", "periodStart", "basis", "careerId", "laneKey", "skillId", "methodologyVersion");

