-- CreateEnum
CREATE TYPE "MarketSeniority" AS ENUM ('INTERN', 'JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL', 'LEAD', 'MANAGER');

-- CreateEnum
CREATE TYPE "MarketEmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY');

-- AlterTable
ALTER TABLE "market_raw_job" ADD COLUMN     "marketJobId" TEXT;

-- CreateTable
CREATE TABLE "market_job" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "seniority" "MarketSeniority",
    "workType" "WorkType",
    "locationText" TEXT,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "experienceMinYears" INTEGER,
    "experienceMaxYears" INTEGER,
    "employmentType" "MarketEmploymentType",
    "postedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "status" "MarketListingStatus" NOT NULL DEFAULT 'OPEN',
    "shingleSketch" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "primaryRawJobId" TEXT,
    "sourceCount" INTEGER NOT NULL DEFAULT 1,
    "normalizerVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "market_job_companyId_normalizedTitle_idx" ON "market_job"("companyId", "normalizedTitle");

-- CreateIndex
CREATE INDEX "market_job_status_lastSeenAt_idx" ON "market_job"("status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "market_job_firstSeenAt_idx" ON "market_job"("firstSeenAt");

-- CreateIndex
CREATE INDEX "market_raw_job_marketJobId_idx" ON "market_raw_job"("marketJobId");

-- AddForeignKey
ALTER TABLE "market_raw_job" ADD CONSTRAINT "market_raw_job_marketJobId_fkey" FOREIGN KEY ("marketJobId") REFERENCES "market_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_job" ADD CONSTRAINT "market_job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

