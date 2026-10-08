-- CreateEnum
CREATE TYPE "SkillAliasStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "career_skill_requirement" ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "sourceRef" TEXT;

-- AlterTable
ALTER TABLE "skill" ADD COLUMN     "domainId" TEXT,
ADD COLUMN     "normalizedName" TEXT;

-- CreateTable
CREATE TABLE "skill_domain" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_alias" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "status" "SkillAliasStatus" NOT NULL DEFAULT 'APPROVED',
    "source" TEXT NOT NULL DEFAULT 'SEED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intel_config" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intel_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "intel_config_change" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB NOT NULL,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intel_config_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skill_domain_key_key" ON "skill_domain"("key");

-- CreateIndex
CREATE UNIQUE INDEX "skill_alias_normalizedAlias_key" ON "skill_alias"("normalizedAlias");

-- CreateIndex
CREATE INDEX "skill_alias_skillId_idx" ON "skill_alias"("skillId");

-- CreateIndex
CREATE INDEX "intel_config_change_key_createdAt_idx" ON "intel_config_change"("key", "createdAt");

-- CreateIndex
CREATE INDEX "skill_normalizedName_idx" ON "skill"("normalizedName");

-- CreateIndex
CREATE INDEX "skill_domainId_idx" ON "skill"("domainId");

-- AddForeignKey
ALTER TABLE "skill" ADD CONSTRAINT "skill_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "skill_domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_domain" ADD CONSTRAINT "skill_domain_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "skill_domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_alias" ADD CONSTRAINT "skill_alias_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

