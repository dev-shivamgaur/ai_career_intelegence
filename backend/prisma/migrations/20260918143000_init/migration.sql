-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('STUDENT', 'FRESHER', 'WORKING_PROFESSIONAL');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('HIGH_SCHOOL', 'DIPLOMA', 'UNDERGRADUATE', 'POSTGRADUATE');

-- CreateEnum
CREATE TYPE "SkillSource" AS ENUM ('USER', 'AI_DETECTED', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "SkillStatus" AS ENUM ('STRONG', 'GOOD', 'NEEDS_IMPROVEMENT', 'MISSING');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "RequirementType" AS ENUM ('REQUIRED', 'RECOMMENDED', 'NICE_TO_HAVE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "RoadmapPhase" AS ENUM ('D7', 'D30', 'D60', 'D90', 'D180');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DEGREE', 'MARKSHEET', 'CERTIFICATE', 'RESUME', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'EXTRACTING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE');

-- CreateEnum
CREATE TYPE "JobMatchLabel" AS ENUM ('STRONG', 'POTENTIAL', 'LOW');

-- CreateEnum
CREATE TYPE "EligibilityStatus" AS ENUM ('ELIGIBLE', 'POSSIBLY_ELIGIBLE', 'NOT_ELIGIBLE', 'NEEDS_VERIFICATION');

-- CreateEnum
CREATE TYPE "SourceQuality" AS ENUM ('OFFICIAL', 'TRUSTED', 'ESTABLISHED', 'COMMUNITY', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('JOB', 'LEARNING', 'GOVERNMENT', 'CAREER_GUIDE', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "ResearchStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "LearningStyle" AS ENUM ('PROJECT', 'COURSE', 'MIXED', 'READING');

-- CreateEnum
CREATE TYPE "RemotePreference" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE', 'ANY');

-- CreateEnum
CREATE TYPE "ExperienceType" AS ENUM ('INTERNSHIP', 'JOB', 'FREELANCE', 'FRESHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ANALYSIS', 'OPPORTUNITY', 'PROGRESS', 'PROFILE');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CareerTrack" AS ENUM ('PRIVATE_TECH', 'GOVERNMENT_EXAM');

-- CreateEnum
CREATE TYPE "GovernmentExamCategory" AS ENUM ('SSC', 'UPSC', 'BANKING', 'RAILWAY', 'DEFENCE', 'STATE', 'TEACHING');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "avatarInitials" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'FRESHER',
    "educationLevel" "EducationLevel" NOT NULL DEFAULT 'UNDERGRADUATE',
    "location" TEXT,
    "availableHoursPerDay" INTEGER NOT NULL DEFAULT 2,
    "learningStyle" "LearningStyle" NOT NULL DEFAULT 'PROJECT',
    "remotePreference" "RemotePreference" NOT NULL DEFAULT 'HYBRID',
    "careerTrack" "CareerTrack" NOT NULL DEFAULT 'PRIVATE_TECH',
    "completionPercent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "education" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "specialization" TEXT,
    "graduationYear" INTEGER,
    "level" "EducationLevel" NOT NULL DEFAULT 'UNDERGRADUATE',
    "scoreLabel" TEXT,
    "aiDetected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_skill" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "proficiency" INTEGER NOT NULL DEFAULT 0,
    "source" "SkillSource" NOT NULL DEFAULT 'USER',
    "status" "SkillStatus" NOT NULL DEFAULT 'GOOD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "year" INTEGER,
    "aiDetected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "skills" TEXT[],
    "year" INTEGER,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experience" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "type" "ExperienceType" NOT NULL DEFAULT 'FRESHER',
    "summary" TEXT NOT NULL,
    "startYear" INTEGER,
    "endYear" INTEGER,
    "isPresent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT,
    "type" "DocumentType" NOT NULL DEFAULT 'OTHER',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "storageKey" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_extraction" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "degree" TEXT,
    "subjects" JSONB,
    "skillsDetected" TEXT[],
    "summary" TEXT,
    "suggestedFields" JSONB,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_extraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "overview" TEXT NOT NULL,
    "marketExpectations" TEXT NOT NULL,
    "entryLevelExpectations" TEXT NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_skill_requirement" (
    "id" TEXT NOT NULL,
    "careerId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "importance" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "type" "RequirementType" NOT NULL DEFAULT 'REQUIRED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "career_skill_requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "careerId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "customTitle" TEXT,
    "estimatedMatch" INTEGER,
    "breakdown" JSONB,
    "whyItMayFit" TEXT[],
    "strongAreas" TEXT[],
    "missingAreas" TEXT[],
    "potentialChallenges" TEXT[],
    "evidence" JSONB,
    "lastAnalyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_gap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "currentStatus" "SkillStatus" NOT NULL DEFAULT 'MISSING',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "estimatedHours" INTEGER NOT NULL DEFAULT 10,
    "why" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_gap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "careerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roadmap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_task" (
    "id" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "why" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "estimatedEffort" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "relatedSkill" TEXT,
    "suggestedResource" TEXT,
    "phase" "RoadmapPhase" NOT NULL DEFAULT 'D30',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roadmap_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "status" "ResearchStatus" NOT NULL DEFAULT 'PENDING',
    "summary" TEXT,
    "sourcesAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "jobDescriptions" INTEGER NOT NULL DEFAULT 0,
    "learningResources" INTEGER NOT NULL DEFAULT 0,
    "governmentSources" INTEGER NOT NULL DEFAULT 0,
    "skillPatterns" INTEGER NOT NULL DEFAULT 0,
    "verificationStatus" TEXT,
    "timeline" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_source" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "domain" TEXT,
    "quality" "SourceQuality" NOT NULL DEFAULT 'UNVERIFIED',
    "keyFinding" TEXT,
    "usedInRecommendation" BOOLEAN NOT NULL DEFAULT false,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_finding" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunk" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "location" TEXT,
    "workType" "WorkType" NOT NULL DEFAULT 'HYBRID',
    "experience" TEXT,
    "description" TEXT,
    "whyMatches" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_skill" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "isMissing" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "job_skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_match" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "matchPercent" INTEGER NOT NULL,
    "matchLabel" "JobMatchLabel" NOT NULL DEFAULT 'POTENTIAL',
    "whyMatches" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "government_opportunity" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "opportunity" TEXT NOT NULL,
    "eligibility" TEXT NOT NULL,
    "ageRequirement" TEXT,
    "educationRequirement" TEXT,
    "location" TEXT,
    "deadline" TEXT,
    "sourceVerification" TEXT,
    "officialNote" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "government_opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "government_eligibility" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "status" "EligibilityStatus" NOT NULL DEFAULT 'NEEDS_VERIFICATION',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "government_eligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "government_exam" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "conductingBody" TEXT NOT NULL,
    "category" "GovernmentExamCategory" NOT NULL,
    "overview" TEXT NOT NULL,
    "eligibility" TEXT NOT NULL,
    "ageLimit" TEXT,
    "educationRequirement" TEXT,
    "examPattern" JSONB,
    "stages" TEXT[],
    "officialNote" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "government_exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "government_exam_subject" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weightage" TEXT,
    "topics" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "government_exam_subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "government_exam_plan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "targetYear" INTEGER,
    "dailyMinutes" INTEGER NOT NULL DEFAULT 120,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "government_exam_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "government_exam_topic_progress" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "revisedCount" INTEGER NOT NULL DEFAULT 0,
    "lastRevisedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "government_exam_topic_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_snapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillsCompleted" INTEGER NOT NULL DEFAULT 0,
    "skillsTotal" INTEGER NOT NULL DEFAULT 0,
    "roadmapPercent" INTEGER NOT NULL DEFAULT 0,
    "learningHours" INTEGER NOT NULL DEFAULT 0,
    "projectsCompleted" INTEGER NOT NULL DEFAULT 0,
    "applications" INTEGER NOT NULL DEFAULT 0,
    "interviewPrepPercent" INTEGER NOT NULL DEFAULT 0,
    "skillProgressOverTime" JSONB,
    "applicationsOverTime" JSONB,
    "roadmapCompletionOverTime" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_event" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_message" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_phone_key" ON "user"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_phone_idx" ON "user"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "profile_userId_key" ON "profile"("userId");

-- CreateIndex
CREATE INDEX "profile_userId_idx" ON "profile"("userId");

-- CreateIndex
CREATE INDEX "education_profileId_idx" ON "education"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "skill_name_key" ON "skill"("name");

-- CreateIndex
CREATE INDEX "skill_category_idx" ON "skill"("category");

-- CreateIndex
CREATE INDEX "user_skill_profileId_idx" ON "user_skill"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "user_skill_profileId_skillId_key" ON "user_skill"("profileId", "skillId");

-- CreateIndex
CREATE INDEX "certification_profileId_idx" ON "certification"("profileId");

-- CreateIndex
CREATE INDEX "project_profileId_idx" ON "project"("profileId");

-- CreateIndex
CREATE INDEX "experience_profileId_idx" ON "experience"("profileId");

-- CreateIndex
CREATE INDEX "document_userId_idx" ON "document"("userId");

-- CreateIndex
CREATE INDEX "document_status_idx" ON "document"("status");

-- CreateIndex
CREATE UNIQUE INDEX "document_extraction_documentId_key" ON "document_extraction"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "career_slug_key" ON "career"("slug");

-- CreateIndex
CREATE INDEX "career_slug_idx" ON "career"("slug");

-- CreateIndex
CREATE INDEX "career_skill_requirement_careerId_idx" ON "career_skill_requirement"("careerId");

-- CreateIndex
CREATE UNIQUE INDEX "career_skill_requirement_careerId_skillId_key" ON "career_skill_requirement"("careerId", "skillId");

-- CreateIndex
CREATE INDEX "career_goal_userId_idx" ON "career_goal"("userId");

-- CreateIndex
CREATE INDEX "career_goal_userId_isActive_idx" ON "career_goal"("userId", "isActive");

-- CreateIndex
CREATE INDEX "skill_gap_userId_idx" ON "skill_gap"("userId");

-- CreateIndex
CREATE INDEX "skill_gap_priority_idx" ON "skill_gap"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "skill_gap_userId_skillId_key" ON "skill_gap"("userId", "skillId");

-- CreateIndex
CREATE INDEX "roadmap_userId_idx" ON "roadmap"("userId");

-- CreateIndex
CREATE INDEX "roadmap_task_roadmapId_idx" ON "roadmap_task"("roadmapId");

-- CreateIndex
CREATE INDEX "roadmap_task_status_idx" ON "roadmap_task"("status");

-- CreateIndex
CREATE INDEX "research_session_userId_idx" ON "research_session"("userId");

-- CreateIndex
CREATE INDEX "research_session_status_idx" ON "research_session"("status");

-- CreateIndex
CREATE INDEX "research_source_sessionId_idx" ON "research_source"("sessionId");

-- CreateIndex
CREATE INDEX "research_finding_sessionId_idx" ON "research_finding"("sessionId");

-- CreateIndex
CREATE INDEX "knowledge_chunk_title_idx" ON "knowledge_chunk"("title");

-- CreateIndex
CREATE INDEX "job_isDemo_idx" ON "job"("isDemo");

-- CreateIndex
CREATE INDEX "job_role_idx" ON "job"("role");

-- CreateIndex
CREATE INDEX "job_skill_jobId_idx" ON "job_skill"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "job_skill_jobId_skillId_key" ON "job_skill"("jobId", "skillId");

-- CreateIndex
CREATE INDEX "job_match_userId_idx" ON "job_match"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "job_match_userId_jobId_key" ON "job_match"("userId", "jobId");

-- CreateIndex
CREATE INDEX "government_opportunity_isDemo_idx" ON "government_opportunity"("isDemo");

-- CreateIndex
CREATE INDEX "government_eligibility_userId_idx" ON "government_eligibility"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "government_eligibility_userId_opportunityId_key" ON "government_eligibility"("userId", "opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "government_exam_slug_key" ON "government_exam"("slug");

-- CreateIndex
CREATE INDEX "government_exam_category_idx" ON "government_exam"("category");

-- CreateIndex
CREATE INDEX "government_exam_slug_idx" ON "government_exam"("slug");

-- CreateIndex
CREATE INDEX "government_exam_subject_examId_idx" ON "government_exam_subject"("examId");

-- CreateIndex
CREATE INDEX "government_exam_plan_userId_idx" ON "government_exam_plan"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "government_exam_plan_userId_examId_key" ON "government_exam_plan"("userId", "examId");

-- CreateIndex
CREATE INDEX "government_exam_topic_progress_planId_idx" ON "government_exam_topic_progress"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "government_exam_topic_progress_planId_subjectId_topic_key" ON "government_exam_topic_progress"("planId", "subjectId", "topic");

-- CreateIndex
CREATE INDEX "progress_snapshot_userId_idx" ON "progress_snapshot"("userId");

-- CreateIndex
CREATE INDEX "progress_event_userId_idx" ON "progress_event"("userId");

-- CreateIndex
CREATE INDEX "progress_event_createdAt_idx" ON "progress_event"("createdAt");

-- CreateIndex
CREATE INDEX "chat_session_userId_idx" ON "chat_session"("userId");

-- CreateIndex
CREATE INDEX "chat_message_sessionId_idx" ON "chat_message"("sessionId");

-- CreateIndex
CREATE INDEX "notification_userId_idx" ON "notification"("userId");

-- CreateIndex
CREATE INDEX "notification_userId_read_idx" ON "notification"("userId", "read");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_tokenHash_key" ON "refresh_token"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_token_userId_idx" ON "refresh_token"("userId");

-- CreateIndex
CREATE INDEX "refresh_token_expiresAt_idx" ON "refresh_token"("expiresAt");

-- AddForeignKey
ALTER TABLE "profile" ADD CONSTRAINT "profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education" ADD CONSTRAINT "education_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skill" ADD CONSTRAINT "user_skill_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skill" ADD CONSTRAINT "user_skill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience" ADD CONSTRAINT "experience_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_extraction" ADD CONSTRAINT "document_extraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_skill_requirement" ADD CONSTRAINT "career_skill_requirement_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "career"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_skill_requirement" ADD CONSTRAINT "career_skill_requirement_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_goal" ADD CONSTRAINT "career_goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_goal" ADD CONSTRAINT "career_goal_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "career"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_gap" ADD CONSTRAINT "skill_gap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_gap" ADD CONSTRAINT "skill_gap_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap" ADD CONSTRAINT "roadmap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap" ADD CONSTRAINT "roadmap_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "career"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_task" ADD CONSTRAINT "roadmap_task_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_session" ADD CONSTRAINT "research_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_source" ADD CONSTRAINT "research_source_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "research_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_finding" ADD CONSTRAINT "research_finding_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "research_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_skill" ADD CONSTRAINT "job_skill_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_skill" ADD CONSTRAINT "job_skill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_match" ADD CONSTRAINT "job_match_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_match" ADD CONSTRAINT "job_match_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_eligibility" ADD CONSTRAINT "government_eligibility_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_eligibility" ADD CONSTRAINT "government_eligibility_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "government_opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_exam_subject" ADD CONSTRAINT "government_exam_subject_examId_fkey" FOREIGN KEY ("examId") REFERENCES "government_exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_exam_plan" ADD CONSTRAINT "government_exam_plan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_exam_plan" ADD CONSTRAINT "government_exam_plan_examId_fkey" FOREIGN KEY ("examId") REFERENCES "government_exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_exam_topic_progress" ADD CONSTRAINT "government_exam_topic_progress_planId_fkey" FOREIGN KEY ("planId") REFERENCES "government_exam_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_exam_topic_progress" ADD CONSTRAINT "government_exam_topic_progress_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "government_exam_subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_snapshot" ADD CONSTRAINT "progress_snapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_event" ADD CONSTRAINT "progress_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_session" ADD CONSTRAINT "chat_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

