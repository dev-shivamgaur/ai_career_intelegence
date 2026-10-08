# Current System Architecture (audit baseline, pre-Market-Intelligence)

Audit date: 2026-10-09. This document describes the system as it exists in code before any
Market Intelligence work. It is the reference that "existing behavior must stay unchanged" is
measured against.

## Runtime topology

| Component | Technology | Notes |
|-----------|------------|-------|
| API | NestJS 10 modular monolith (`backend/src/main.ts`) | Prefix `api/v1`, port from `PORT` (dev `.env`: 3001) |
| Worker | Same `AppModule` without HTTP (`backend/src/worker.ts`) | Sets `INGEST_WORKER=1`, consumes `career.ingest` |
| Database | PostgreSQL (dev: local Windows service, PG 18, db `ai`) | Prisma 6, client generated to `backend/generated/prisma` |
| Queue | RabbitMQ (`amqplib`) | docker `aci-rabbitmq` |
| Cache / OTP | Redis via ioredis | Falls back to in-memory `Map` when unavailable |
| Vector store | Qdrant | RAG (`career_knowledge*`) and sarkari collections |
| LLM | LangChain: Gemini (dev) / OpenAI (prod) | `ai/ai-runtime.ts`, `ai/llm.service.ts` |
| Embeddings | Ollama (dev) / OpenAI (prod) | `ai/embedding.service.ts` |
| Frontend | React 19 + Vite + Redux Toolkit + Tailwind + Recharts | Vite proxies `/api` to `localhost:3001` |

## Backend modules

`auth`, `token`, `users`, `profiles`, `documents`, `careers`, `skill-gap`, `roadmap`, `jobs`,
`opportunities/government`, `sarkari`, `research`, `ai` (global), `agent` (global), `rag`,
`copilot`, `progress`, `notifications`, `admin`, `web` (global), `queue`, `redis` (global),
`storage`, `prisma`, `common`.

## Core data model (career comparison)

```
User 1-1 Profile 1-* UserSkill *-1 Skill
User 1-* CareerGoal *-1 Career 1-* CareerSkillRequirement *-1 Skill
User 1-* SkillGap *-1 Skill
User 1-* Roadmap 1-* RoadmapTask
Job 1-* JobSkill *-1 Skill ; Job 1-* JobMatch *-1 User   (admin catalog; JobMatch never written)
IngestRun 1-* IngestCareerJob 1-* IngestJobStep            (Roadmap.sh ingest tracking)
```

- `Skill.name` is unique by exact, case-sensitive string. `Skill.category` is free-form.
- `CareerSkillRequirement` has `importance`, `type` (REQUIRED / RECOMMENDED / NICE_TO_HAVE),
  `stackLane` (nullable) and `layer` (string: CORE / STACK_REQUIRED / OPTIONAL / ALTERNATIVE).
  Unique on `(careerId, skillId, stackLane)`; NULL lanes are not deduplicated by Postgres.
- `UserSkill.source` is USER / AI_DETECTED / DOCUMENT; `AI_DETECTED` is never written.

## Flow 1: Resume to user skills

1. `POST /documents` → `DocumentsService.upload` stores file, creates `Document(PROCESSING)`,
   then fires `finishExtraction` without awaiting.
2. `DocumentIntelligenceService.extract`: PDF parse (Unstructured → PDFLoader → pdf-parse),
   vision fallback for scans, LLM JSON extraction merged with regex lexicon
   (`ai/skill-lexicon.ts`, 36 aliases).
3. `applyExtractionToProfile`: for resumes, deletes `UserSkill` rows with source DOCUMENT, then
   upserts each detected skill (`proficiency 45`, `source DOCUMENT`). Existing USER rows that
   match are relabelled DOCUMENT. Also writes Education / Experience / Project / Certification.
4. Then: `persistDetectedStack`, `skillGaps.safeRecalculate`, background `matchAndSuggest`,
   `ensureUserRoadmap`, `fit.persist`.

## Flow 2: User vs career comparison

- `EvidenceService.forUser` builds the known-skill set (all UserSkills, document skills, project
  names and skills), detects stack lane, seniority and learner tier.
- `requirementsForStack` / `computeRoleSkillMatch` choose the judged requirements (drop OPTIONAL,
  ALTERNATIVE, other lanes).
- `skillMatches` (`ai/skill-match.ts`) matches with normalized exact / bidirectional substring /
  all-tokens-substring logic.
- `SkillGapService.recalculate` deletes and rewrites `SkillGap` rows and rebuilds the roadmap.
- `FitScoreService.persist` writes `CareerGoal.estimatedMatch` using
  skills 35% / projects 25% / education 15% / experience 10% / "market" 15%, where "market" is
  actually syllabus coverage from `RoadmapCorpusService.learningProgress`.

## Flow 3: Roadmap.sh ingestion

Two independent writers of `CareerSkillRequirement`:

1. Queue path: `FieldIngestAgent.ingestCareer` (worker) fetches
   `https://roadmap.sh/api/v1-official-roadmap/{slug}`, filters junk, optional LLM filter,
   inserts up to 40 **new** topics as `OPTIONAL / RECOMMENDED / LOW` and adds D30
   `RoadmapTask` rows for active learners. Never modifies existing rows; skips custom careers.
2. Request path: `RoadmapCorpusService.syncCareer` → `mergeLayeredRequirements` writes CORE rows
   from `coreTopics`, lane topics as STACK_REQUIRED / OPTIONAL, plus `KnowledgeChunk` + Qdrant.

Admin catalog (`admin-catalog.service.ts`) writes CORE rows on create / replace and
STACK_REQUIRED rows through the lane editor; `repairStackLanes()` runs on every boot.

## Queue

- Exchange / queue / routing key `career.ingest` (direct), DLX `career.ingest.dlx`, DLQ
  `career.ingest.dlq`.
- Message: `{ runId, jobId, careerId, trigger, attempt }`.
- `IngestCareerConsumer` (only when `INGEST_WORKER=1`): prefetch `INGEST_WORKER_CONCURRENCY`
  (default 3), max 3 attempts counted via `IngestJobStep(load_career)` rows, exponential delay
  inside the handler, republish on retry, DLQ on final failure.
- `RabbitConnection` connects once in `onModuleInit`; no reconnect.

## Scheduler

`FieldIngestScheduler` (API process only): `setInterval` every 10 minutes; acts in the 08:00 and
18:00 IST hours; deduplicates via an existing `IngestRun(trigger=SCHEDULER)` in the current IST
hour; `FIELD_INGEST_DEBUG=1` enqueues on boot and treats every hour as a slot.

## Redis usage

Only `auth.service.ts` (OTP hash, cooldown, send window, verify attempts).

## API surface (prefix `/api/v1`)

- auth: `send-otp`, `verify-otp`, `refresh`, `logout`, `me`
- careers: `GET /careers`, `GET /careers/:id` (public); `POST/PATCH /career-goals`,
  `GET /career-analysis`, `POST /career-analysis/run`, `GET /dashboard`
- skill-gap: `GET /skill-gaps`, `POST /skill-gaps/recalculate`, lesson, practice
- roadmap: `GET /roadmap`, `POST /roadmap/generate`, task check / patch
- jobs: `GET /jobs`, `GET /jobs/:id` (public), `GET /jobs/matches` (always empty)
- documents, profile, research, copilot, progress, notifications, government, sarkari
- admin (ADMIN role): skills, careers, lanes, requirements, jobs, exams, opportunities,
  users, stats, `admin/ingest/runs`

Response envelope: `{ success: true, data }`; errors `{ success: false, error: { code, message } }`.

## Frontend

Routes under `AppLayout`: dashboard, profile, documents, career-analysis, skill-gap, roadmap,
jobs, opportunities, government, sarkari, research, copilot, progress, settings. Admin under
`AdminGate`/`AdminLayout`: overview, users, careers (lane editor, ingest runs), skills, jobs,
exams, vacancies. Data loading via `useAsyncData`; explanations via `WhyPanel` in `Modal`.

## Tests and tooling

- Backend: Jest (`jest.config.js`, `rootDir: src`), one spec `ai/learner-tier.spec.ts`.
- Frontend: no tests. No CI. No lint script.

## Migrations

Eight migrations in `backend/prisma/migrations`. They have drifted from `schema.prisma`
(see `issue-register.md`, issue I-01).
