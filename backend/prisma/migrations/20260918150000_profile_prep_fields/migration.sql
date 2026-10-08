-- AlterTable
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "prepGoalText" TEXT;
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "targetExamSlug" TEXT;
