-- AlterTable
ALTER TABLE "prep_package" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "prep_package" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);

UPDATE "prep_package"
SET "publishedAt" = "createdAt"
WHERE "status" = 'PUBLISHED' AND "publishedAt" IS NULL;
