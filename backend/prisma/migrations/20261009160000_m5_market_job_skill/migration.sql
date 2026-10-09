-- CreateEnum
CREATE TYPE "MarketSkillMethod" AS ENUM ('RULE', 'LLM', 'RULE_LLM');

-- CreateTable
CREATE TABLE "market_job_skill" (
    "id" TEXT NOT NULL,
    "marketJobId" TEXT NOT NULL,
    "rawJobId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "skillId" TEXT,
    "resolveMethod" TEXT NOT NULL,
    "level" "RequirementType" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "method" "MarketSkillMethod" NOT NULL,
    "evidence" TEXT,
    "evidenceStart" INTEGER,
    "evidenceEnd" INTEGER,
    "yearsRequired" INTEGER,
    "extractorVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_job_skill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "market_job_skill_skillId_idx" ON "market_job_skill"("skillId");

-- CreateIndex
CREATE INDEX "market_job_skill_marketJobId_idx" ON "market_job_skill"("marketJobId");

-- CreateIndex
CREATE INDEX "market_job_skill_normalizedName_idx" ON "market_job_skill"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "market_job_skill_rawJobId_normalizedName_key" ON "market_job_skill"("rawJobId", "normalizedName");

-- AddForeignKey
ALTER TABLE "market_job_skill" ADD CONSTRAINT "market_job_skill_marketJobId_fkey" FOREIGN KEY ("marketJobId") REFERENCES "market_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_job_skill" ADD CONSTRAINT "market_job_skill_rawJobId_fkey" FOREIGN KEY ("rawJobId") REFERENCES "market_raw_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_job_skill" ADD CONSTRAINT "market_job_skill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

