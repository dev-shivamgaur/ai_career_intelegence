-- CreateEnum
CREATE TYPE "PrepPlan" AS ENUM ('FREE', 'PAID');

-- CreateEnum
CREATE TYPE "PrepPackageStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "PrepSessionStatus" AS ENUM ('IN_PROGRESS', 'NEEDS_PRACTICE', 'VERIFIED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "PrepLessonStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PrepUsageKind" AS ENUM ('GENERATE', 'GRADE', 'HINT');

-- AlterTable
ALTER TABLE "user" ADD COLUMN "prepPlan" "PrepPlan" NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE "prep_package" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "careerScope" TEXT NOT NULL DEFAULT '*',
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "rubric" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" "PrepPackageStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prep_package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prep_session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "careerId" TEXT,
    "packageId" TEXT NOT NULL,
    "roadmapTaskId" TEXT,
    "status" "PrepSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "resumeState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prep_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prep_lesson_progress" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "lessonKey" TEXT NOT NULL,
    "status" "PrepLessonStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prep_lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prep_attempt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "answer" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL DEFAULT 100,
    "feedback" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prep_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prep_task_submission" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER NOT NULL DEFAULT 0,
    "feedback" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prep_task_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prep_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "PrepUsageKind" NOT NULL,
    "model" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prep_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prep_package_skillId_careerScope_version_key" ON "prep_package"("skillId", "careerScope", "version");

-- CreateIndex
CREATE INDEX "prep_package_skillId_status_idx" ON "prep_package"("skillId", "status");

-- CreateIndex
CREATE INDEX "prep_session_userId_skillId_status_idx" ON "prep_session"("userId", "skillId", "status");

-- CreateIndex
CREATE INDEX "prep_session_packageId_idx" ON "prep_session"("packageId");

-- One open session per learner and skill. Historical sessions stay.
CREATE UNIQUE INDEX "prep_session_one_open" ON "prep_session"("userId", "skillId") WHERE "status" = 'IN_PROGRESS';

-- CreateIndex
CREATE UNIQUE INDEX "prep_lesson_progress_sessionId_lessonKey_key" ON "prep_lesson_progress"("sessionId", "lessonKey");

-- CreateIndex
CREATE UNIQUE INDEX "prep_attempt_sessionId_idempotencyKey_key" ON "prep_attempt"("sessionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "prep_attempt_sessionId_questionKey_idx" ON "prep_attempt"("sessionId", "questionKey");

-- CreateIndex
CREATE INDEX "prep_task_submission_sessionId_taskKey_idx" ON "prep_task_submission"("sessionId", "taskKey");

-- CreateIndex
CREATE INDEX "prep_usage_userId_kind_createdAt_idx" ON "prep_usage"("userId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "prep_package" ADD CONSTRAINT "prep_package_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_session" ADD CONSTRAINT "prep_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_session" ADD CONSTRAINT "prep_session_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_session" ADD CONSTRAINT "prep_session_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "career"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_session" ADD CONSTRAINT "prep_session_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "prep_package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_session" ADD CONSTRAINT "prep_session_roadmapTaskId_fkey" FOREIGN KEY ("roadmapTaskId") REFERENCES "roadmap_task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_lesson_progress" ADD CONSTRAINT "prep_lesson_progress_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "prep_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_attempt" ADD CONSTRAINT "prep_attempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "prep_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_task_submission" ADD CONSTRAINT "prep_task_submission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "prep_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_usage" ADD CONSTRAINT "prep_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
