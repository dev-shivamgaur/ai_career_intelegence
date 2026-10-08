-- CreateEnum
CREATE TYPE "IngestRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL_FAILED', 'FAILED');

-- CreateEnum
CREATE TYPE "IngestTrigger" AS ENUM ('SCHEDULER', 'ADMIN', 'CREATE');

-- CreateEnum
CREATE TYPE "IngestJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "IngestStepStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "ingest_run" (
    "id" TEXT NOT NULL,
    "trigger" "IngestTrigger" NOT NULL,
    "status" "IngestRunStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "totalJobs" INTEGER NOT NULL DEFAULT 0,
    "completedJobs" INTEGER NOT NULL DEFAULT 0,
    "failedJobs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingest_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_career_job" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "careerId" TEXT NOT NULL,
    "status" "IngestJobStatus" NOT NULL DEFAULT 'QUEUED',
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingest_career_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_job_step" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "status" "IngestStepStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "meta" JSONB,
    "error" TEXT,

    CONSTRAINT "ingest_job_step_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingest_run_createdAt_idx" ON "ingest_run"("createdAt");

-- CreateIndex
CREATE INDEX "ingest_career_job_runId_idx" ON "ingest_career_job"("runId");

-- CreateIndex
CREATE INDEX "ingest_career_job_careerId_createdAt_idx" ON "ingest_career_job"("careerId", "createdAt");

-- CreateIndex
CREATE INDEX "ingest_job_step_jobId_idx" ON "ingest_job_step"("jobId");

-- AddForeignKey
ALTER TABLE "ingest_career_job" ADD CONSTRAINT "ingest_career_job_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ingest_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_career_job" ADD CONSTRAINT "ingest_career_job_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "career"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_job_step" ADD CONSTRAINT "ingest_job_step_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ingest_career_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
