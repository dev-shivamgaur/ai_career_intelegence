# Issue Register (from the pre-Market-Intelligence audit)

Status values: OPEN (not addressed), MVP (handled additively by the MVP without changing existing
behavior), BACKLOG-Hn (behavior-changing fix, needs separate approval), CLOSED.

| ID | Issue | Where | Status |
|----|-------|-------|--------|
| I-01 | Migrations do not create `career.syllabusSlug`, `coreTopics`, `stackLanes`, `career_skill_requirement.stackLane`, `layer`, `profile.primaryStack`; fresh `migrate deploy` fails at `20261002133000` | `backend/prisma/migrations` | CLOSED (M0.3-M0.5): `20261002130000_schema_drift_repair` added; fresh deploy + smoke pass; restored copy and dev DB `migrate resolve --applied`, empty diff, identical row counts |
| I-02 | `Skill.name` exact case-sensitive unique; no alias table; lexicon cache never invalidated | `schema.prisma`, `ai/skill-lexicon.service.ts` | MVP (M1, M7) |
| I-03 | `skillMatches` bidirectional substring matching ("go" matches "mongodb") | `ai/skill-match.ts` | BACKLOG-H7 |
| I-04 | `scoreLane` substring keywords ("java" inside "javascript") | `ai/stack-lanes.ts` | BACKLOG-H7 |
| I-05 | `marketScore` is syllabus coverage, not market data | `ai/fit-score.service.ts` | MVP (new separate data; existing field untouched) |
| I-06 | `JobMatch` never written; `/jobs/matches` always empty | `jobs/` | Future F3 |
| I-07 | Resume upload deletes DOCUMENT skills and relabels USER skills as DOCUMENT | `documents/documents.service.ts` | BACKLOG-H9 |
| I-08 | `PUT /admin/careers/:id/requirements` deletes lane and OPTIONAL rows | `admin/admin-catalog.service.ts` | BACKLOG-H5 |
| I-09 | `RabbitConnection` never reconnects; `isReady()` stays true on a dead channel | `queue/rabbit.connection.ts` | BACKLOG-H6 (market uses its own connection) |
| I-10 | `console.log(user)` in `me()` logs personal data | `auth/auth.service.ts` | BACKLOG-H1 |
| I-11 | `AllExceptionsFilter` never logs 5xx | `common/filters/http-exception.filter.ts` | BACKLOG-H2 |
| I-12 | Vite proxy 3001 vs default `PORT` 3000 | `frontend/vite.config.ts` | CLOSED: dev `.env` sets `PORT=3001`, so they match |
| I-13 | `get_latest_research` tool registered twice | `ai/agent.service.ts` | BACKLOG-H4 |
| I-14 | Existing requirement writers do not record provenance | ingest agent, corpus sync, admin catalog | BACKLOG-H8 (MVP backfills read-only) |
| I-15 | README / analyse.md / backend README stale (BullMQ, seed, mock AI) | docs | BACKLOG-H10 |
| I-16 | No seed config; `scripts/seed-backend-roadmap.js` truncates every table | `backend/scripts` | OPEN (do not run against dev DB) |
| I-17 | `.env.example` contains a literal DB password | `backend/.env.example` | OPEN |
| I-18 | Worker loads full `AppModule` (RAG sync, repairStackLanes run in worker) | `worker.ts` | OPEN |
| I-19 | `WebResearchService` and sarkari fetches have no robots.txt handling or rate limiting | `web/`, `sarkari/` | OPEN (market uses its own client) |
| I-20 | Root `src/` folder contains an unrelated auth service skeleton not referenced by backend | `src/` | OPEN (informational) |
| I-21 | `backend/tmp-auth.json` is an untracked scratch file that may contain tokens | `backend/` | OPEN (excluded from git baseline) |
