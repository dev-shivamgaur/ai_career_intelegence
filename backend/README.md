# AI Career Intelligence — Backend

NestJS modular monolith. Serves authenticated REST under `/api/v1`, background ingest workers, LLM/RAG tooling, and the Prep Engine for skill practice packages.

## Prerequisites

- Node.js 20+
- PostgreSQL (local or Docker)
- Optional: Redis, RabbitMQ, Qdrant, Ollama (dev embeddings), Gemini / OpenAI keys

From repo root, `docker compose up -d` starts **RabbitMQ** and **Qdrant**. Postgres/Redis are often run as local services (see root `docker-compose.yml` comments).

## Quick start

```bash
# Repo root
docker compose up -d

cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

| Endpoint | URL |
|----------|-----|
| API | `http://localhost:3000/api/v1` |
| Swagger | `http://localhost:3000/api/v1/docs` |

Worker process (queue consumers):

```bash
npm run start:worker
```

Seed Prep packages (if used):

```bash
npm run seed:prep
```

## Environment

Copy `.env.example` → `.env`. Important variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection |
| `JWT_*` | Access / refresh secrets and TTLs |
| `ADMIN_PHONES` | E.164 phones that receive `ADMIN` on login |
| `CORS_ORIGIN` | Frontend origin (default `http://localhost:5173`) |
| `LLM_PROVIDER` / `EMBEDDING_PROVIDER` | `auto` or explicit providers |
| `GOOGLE_API_KEY` / `GEMINI_MODEL` | Dev chat (Gemini) |
| `OLLAMA_*` | Dev embeddings |
| `OPENAI_*` | Prod chat/embeddings |
| `QDRANT_URL` | Vector store |
| `RABBITMQ_URL` | Career / field ingest queue |
| `REDIS_URL` | Optional cache / OTP helpers (in-memory fallback) |
| `LLM_TIMEOUT_MS` / `LLM_STRUCTURED_TIMEOUT_MS` | Chat and structured JSON budgets |

In development, OTP `123456` is always accepted; `send-otp` may return the code in the response body.

## Auth flow

1. `POST /auth/send-otp` `{ "phone": "+919876543210" }`
2. `POST /auth/verify-otp` `{ "phone": "...", "code": "123456" }` → access JWT + refresh (HttpOnly cookie + body)
3. Protected routes: `Authorization: Bearer <accessToken>`
4. `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`

CORS allows the Vite origin with credentials.

## Module map (`src/`)

| Folder | Use case |
|--------|----------|
| `auth/` | Phone OTP send/verify, session cookies, login bootstrap |
| `token/` | JWT issue / refresh / revoke helpers |
| `users/` | User records and roles |
| `profiles/` | Learner profile, career track, goals, completion |
| `documents/` | Upload, OCR/extract, apply resume/marksheet facts to profile |
| `careers/` | Career catalog, dashboard aggregates, fit vs target role |
| `skill-gap/` | Recalculate gaps vs career requirements; drives roadmap rebuild |
| `roadmap/` | Learning roadmap tasks for the signed-in user |
| `learner/` | Evidence list, GitHub scan, readiness, personal roadmap APIs (`/learner`, `/admin/learner`) |
| `preparation/` | **Prep Engine** — published packages, sessions, lessons, quiz attempts, tasks, hints, apply |
| `jobs/` | Job catalog listing / matching surfaces |
| `opportunities/government/` | Government vacancy listings |
| `sarkari/` | Exam hub, subjects, notices, sarkari-specific knowledge |
| `research/` | Store short research reports for role/exam context |
| `copilot/` | Chat + SSE stream; agent tools over profile/docs |
| `progress/` | Progress snapshots / activity |
| `notifications/` | In-app notification list |
| `ai/` | LLM runtime, embeddings, agent tool loop, skill matching helpers |
| `rag/` | Chunking, Qdrant sync/query for career (and related) knowledge |
| `admin/` | Admin catalog (users, careers, skills, jobs, exams) + **admin preparation** editor |
| `market/` | Market intelligence admin: sources, runs, slice, demand, compare, skill review |
| `skill-intel/` | Admin skill-intelligence helpers |
| `intel-config/` | Admin config for intel pipelines |
| `queue/` | RabbitMQ producers/consumers; ingest admin |
| `web/` | Shared HTTP/fetch utilities for scraping/ingest |
| `storage/` | Local upload disk (S3-ready interface) |
| `redis/` | Redis client with graceful in-memory fallback |
| `prisma/` | PrismaService wrapper |
| `common/` | Guards, decorators, interceptors, filters |
| `prisma/` (schema) | Schema lives in `backend/prisma/schema.prisma` |

### Prep Engine (learner path)

- Learner: `GET/POST /preparation/...` — list packages (by skill), start/switch session (version), complete lessons, submit attempts/tasks, hints, apply.
- Admin: ` /admin/preparation/...` — draft/publish package versions (published packages stay read-only; new version for edits).

### Learner module vs Preparation

- **`learner/`** — proof and readiness around skills (evidence rows, GitHub, scores).
- **`preparation/`** — structured practice packages (content + session state machine).

They complement each other; Prep can feed evidence/profile when the learner **applies** a completed session.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile NestJS |
| `npm run start` / `start:dev` | API watch mode |
| `npm run start:worker` | Queue worker entry (`worker.ts`) |
| `npm run start:prod` | Run compiled API |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Apply migrations |
| `npm run seed:prep` | Seed prep packages |
| `npm test` | Jest (`passWithNoTests`) |

## Response shape

Most JSON endpoints return:

```json
{ "success": true, "data": { } }
```

Copilot streaming (`POST /copilot/chat/stream`) uses SSE and bypasses the normal transform wrapper.

## Related docs

- Root [README.md](../README.md) — monorepo overview
- [../analyse.md](../analyse.md) — frontend ↔ backend wiring
- [../docs/architecture/current-system.md](../docs/architecture/current-system.md) — data model and core flows
