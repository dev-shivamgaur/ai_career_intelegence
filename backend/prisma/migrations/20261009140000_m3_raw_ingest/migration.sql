-- CreateEnum
CREATE TYPE "MarketListingStatus" AS ENUM ('OPEN', 'CLOSED', 'STALE');

-- CreateEnum
CREATE TYPE "MarketProcessingStatus" AS ENUM ('PENDING', 'NORMALIZED', 'DEDUPED', 'EXTRACTED', 'CLASSIFIED', 'DONE', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "market_raw_job" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "rawTitle" TEXT NOT NULL,
    "rawLocation" TEXT,
    "rawDescription" TEXT,
    "rawPayload" JSONB,
    "rawPayloadStoredAt" TIMESTAMP(3),
    "url" TEXT,
    "department" TEXT,
    "employmentType" TEXT,
    "workplaceType" TEXT,
    "contentHash" TEXT NOT NULL,
    "sourcePostedAt" TIMESTAMP(3),
    "sourceUpdatedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "listingStatus" "MarketListingStatus" NOT NULL DEFAULT 'OPEN',
    "processingStatus" "MarketProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "processorVersion" TEXT,
    "processingError" TEXT,
    "contentPurgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_raw_job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "market_raw_job_processingStatus_idx" ON "market_raw_job"("processingStatus");

-- CreateIndex
CREATE INDEX "market_raw_job_sourceId_listingStatus_idx" ON "market_raw_job"("sourceId", "listingStatus");

-- CreateIndex
CREATE INDEX "market_raw_job_lastSeenAt_idx" ON "market_raw_job"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "market_raw_job_sourceId_externalId_key" ON "market_raw_job"("sourceId", "externalId");

-- AddForeignKey
ALTER TABLE "market_raw_job" ADD CONSTRAINT "market_raw_job_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "market_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

