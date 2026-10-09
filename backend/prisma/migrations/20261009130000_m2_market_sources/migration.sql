-- CreateEnum
CREATE TYPE "MarketSourceType" AS ENUM ('GREENHOUSE', 'LEVER', 'ASHBY');

-- CreateEnum
CREATE TYPE "MarketDisplayPolicy" AS ENUM ('SNIPPET_AND_LINK', 'LINK_ONLY', 'NONE');

-- CreateEnum
CREATE TYPE "RobotsStatus" AS ENUM ('ALLOWED', 'DISALLOWED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MarketRunKind" AS ENUM ('FETCH', 'PROCESS', 'AGGREGATE', 'RETENTION');

-- CreateEnum
CREATE TYPE "MarketTrigger" AS ENUM ('SCHEDULER', 'ADMIN');

-- CreateEnum
CREATE TYPE "MarketRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL_FAILED', 'FAILED');

-- CreateEnum
CREATE TYPE "MarketTaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "website" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_source" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "MarketSourceType" NOT NULL,
    "boardToken" TEXT NOT NULL,
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "crawlIntervalHours" INTEGER NOT NULL DEFAULT 24,
    "termsUrl" TEXT,
    "termsReviewedAt" TIMESTAMP(3),
    "termsReviewedBy" TEXT,
    "termsSummary" TEXT,
    "allowedUses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attributionRequired" BOOLEAN NOT NULL DEFAULT false,
    "termsReviewDueAt" TIMESTAMP(3),
    "storeRawPayload" BOOLEAN NOT NULL DEFAULT false,
    "rawPayloadRetentionDays" INTEGER,
    "descriptionRetentionDays" INTEGER,
    "evidenceExcerptMaxChars" INTEGER,
    "displayPolicy" "MarketDisplayPolicy" NOT NULL DEFAULT 'LINK_ONLY',
    "robotsStatus" "RobotsStatus" NOT NULL DEFAULT 'UNKNOWN',
    "robotsCheckedAt" TIMESTAMP(3),
    "lastFetchAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "pausedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_run" (
    "id" TEXT NOT NULL,
    "kind" "MarketRunKind" NOT NULL,
    "trigger" "MarketTrigger" NOT NULL,
    "status" "MarketRunStatus" NOT NULL DEFAULT 'QUEUED',
    "windowKey" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "completedTasks" INTEGER NOT NULL DEFAULT 0,
    "failedTasks" INTEGER NOT NULL DEFAULT 0,
    "counters" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_task" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" "MarketRunKind" NOT NULL,
    "sourceId" TEXT,
    "careerId" TEXT,
    "status" "MarketTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "error" TEXT,
    "counters" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_slug_key" ON "company"("slug");

-- CreateIndex
CREATE INDEX "market_source_companyId_idx" ON "market_source"("companyId");

-- CreateIndex
CREATE INDEX "market_source_enabled_idx" ON "market_source"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "market_source_type_boardToken_key" ON "market_source"("type", "boardToken");

-- CreateIndex
CREATE INDEX "market_run_kind_createdAt_idx" ON "market_run"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "market_run_windowKey_idx" ON "market_run"("windowKey");

-- CreateIndex
CREATE INDEX "market_task_runId_idx" ON "market_task"("runId");

-- CreateIndex
CREATE INDEX "market_task_sourceId_createdAt_idx" ON "market_task"("sourceId", "createdAt");

-- AddForeignKey
ALTER TABLE "market_source" ADD CONSTRAINT "market_source_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_task" ADD CONSTRAINT "market_task_runId_fkey" FOREIGN KEY ("runId") REFERENCES "market_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_task" ADD CONSTRAINT "market_task_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "market_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

