-- AlterTable
ALTER TABLE "refresh_token" ADD COLUMN IF NOT EXISTS "jti" TEXT;
ALTER TABLE "refresh_token" ADD COLUMN IF NOT EXISTS "familyId" TEXT DEFAULT '';
ALTER TABLE "refresh_token" ADD COLUMN IF NOT EXISTS "fingerprintHash" TEXT DEFAULT '';
ALTER TABLE "refresh_token" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "refresh_token" ADD COLUMN IF NOT EXISTS "replacedByHash" TEXT;
ALTER TABLE "refresh_token" ADD COLUMN IF NOT EXISTS "reusedAt" TIMESTAMP(3);

UPDATE "refresh_token" SET "jti" = "id" WHERE "jti" IS NULL;
UPDATE "refresh_token" SET "familyId" = "id" WHERE "familyId" IS NULL OR "familyId" = '';

CREATE UNIQUE INDEX IF NOT EXISTS "refresh_token_jti_key" ON "refresh_token"("jti");
CREATE INDEX IF NOT EXISTS "refresh_token_familyId_idx" ON "refresh_token"("familyId");
