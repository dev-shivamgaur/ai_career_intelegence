-- Schema drift repair.
-- These objects exist in schema.prisma and in databases created with `prisma db push`, but no earlier
-- migration creates them, so `prisma migrate deploy` on an empty database failed at
-- 20261002133000_requirement_stack_lane (it indexes "stackLane"). Every statement is idempotent.
-- Existing databases that already contain these objects mark this migration as applied with
-- `prisma migrate resolve --applied 20261002130000_schema_drift_repair` instead of running it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
    CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');
  END IF;
END
$$;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" "Role" NOT NULL DEFAULT 'USER';

ALTER TABLE "career" ADD COLUMN IF NOT EXISTS "coreTopics" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "career" ADD COLUMN IF NOT EXISTS "stackLanes" JSONB;
ALTER TABLE "career" ADD COLUMN IF NOT EXISTS "syllabusSlug" TEXT;

ALTER TABLE "career_skill_requirement" ADD COLUMN IF NOT EXISTS "layer" TEXT NOT NULL DEFAULT 'CORE';
ALTER TABLE "career_skill_requirement" ADD COLUMN IF NOT EXISTS "stackLane" TEXT;

ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "primaryStack" TEXT;

UPDATE "refresh_token" SET "jti" = "id" WHERE "jti" IS NULL;
UPDATE "refresh_token" SET "familyId" = "id" WHERE "familyId" IS NULL OR "familyId" = '';
UPDATE "refresh_token" SET "fingerprintHash" = '' WHERE "fingerprintHash" IS NULL;
ALTER TABLE "refresh_token" ALTER COLUMN "jti" SET NOT NULL;
ALTER TABLE "refresh_token" ALTER COLUMN "familyId" SET NOT NULL;
ALTER TABLE "refresh_token" ALTER COLUMN "familyId" DROP DEFAULT;
ALTER TABLE "refresh_token" ALTER COLUMN "fingerprintHash" SET NOT NULL;
ALTER TABLE "refresh_token" ALTER COLUMN "fingerprintHash" DROP DEFAULT;
