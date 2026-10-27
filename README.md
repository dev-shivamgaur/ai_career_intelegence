# AI Career Intelligence

Evidence-based career platform for students, freshers, and early-career professionals (private tech **and** government / sarkari exam tracks).

It does **not** promise a job. It helps answer:

- Which role or exam should I target?
- Are my current skills enough?
- What is missing, and in what order should I learn?
- Which jobs or government opportunities fit my profile?
- What should I practice next with proof on my resume?

```
Phone OTP login
  → Profile + Documents
  → Career / exam goal
  → Skill gap + readiness
  → Roadmap + Prep Engine (learn → quiz → task)
  → Jobs / Sarkari opportunities
  → Research evidence
  → Progress + floating AI Copilot
```

## Repository layout

```
AI/
├── frontend/          React 19 + Vite + TypeScript + Tailwind + Redux Toolkit
├── backend/           NestJS modular monolith + Prisma + PostgreSQL
├── docs/              Architecture notes (market intel, system audit)
├── docker-compose.yml RabbitMQ + Qdrant (Postgres/Redis often run locally)
├── analyse.md         Deeper product / wiring notes
└── README.md          This file
```

Frontend and backend have **separate** `node_modules`. Install inside each folder — not at the repo root.

| Path | Role |
|------|------|
| `frontend/` | Learner UI, floating Copilot widget, admin console |
| `backend/` | REST API under `/api/v1`, workers, LLM/RAG, Prep Engine |
| `docs/architecture/` | System and market-intelligence design notes |
| `docker-compose.yml` | RabbitMQ (ingest queue) + Qdrant (vectors) |

## Product tracks

| Track | Who it is for | Main surfaces |
|-------|----------------|---------------|
| **Private tech** | Software / tech roles | Career analysis, skill gap, roadmap, jobs, prepare, GitHub evidence |
| **Government exam** | Sarkari / competitive exams | Exam hub, vacancies, eligibility flags, prep plan, Copilot on exam context |

Onboarding and profile `careerTrack` decide which nav and APIs the learner sees.

## Major capabilities

| Area | What it does |
|------|----------------|
| **Auth** | Phone OTP → JWT access + refresh cookie |
| **Profile & documents** | Resume/marksheet upload, extraction into skills / education / experience |
| **Careers & skill gap** | Compare user evidence to career/exam requirements; rewrite gaps + roadmap |
| **Learner** | Skill evidence, GitHub scan, readiness score, personal roadmap helpers |
| **Preparation (Prep Engine)** | Versioned skill packages: lessons → quiz attempts → practical tasks → apply to profile |
| **Roadmap** | Ordered learning tasks tied to gaps and prep |
| **Jobs & opportunities** | Catalog matches + government vacancies |
| **Sarkari** | Exam catalog, notices, eligibility-oriented UX |
| **Market / skill intel** | Admin pipelines for demand, sources, skill review (optional UI flag) |
| **Research** | Short web research reports stored for the learner + Copilot |
| **Copilot** | Site-wide floating chat (stream) grounded in profile/docs — not a separate nav page |
| **Admin** | Users, careers, skills, jobs, exams, prep packages, market tools |

## Quick start

### 1. Infrastructure

```bash
# From repo root — RabbitMQ + Qdrant
docker compose up -d
```

PostgreSQL (and optionally Redis) are expected locally. Example DB URL (see `backend/.env.example`):

```
DATABASE_URL="postgresql://postgres:PASSWORD@127.0.0.1:5432/ai?schema=public"
```

Create database `ai` if it does not exist. Prefer a pgvector-capable Postgres if you use vector features via DB; primary vectors live in **Qdrant**.

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit DATABASE_URL, JWT secrets, GOOGLE_API_KEY / Ollama as needed
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

Optional worker (career ingest / queue consumers):

```bash
npm run start:worker
```

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/v1/docs`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

- App: `http://localhost:5173`
- Vite proxies `/api` → backend (`frontend/vite.config.ts`)

### Demo login (development)

- Phone: `+919876543210`
- OTP: `123456` (always accepted when `NODE_ENV=development`)

Admin phones can be bootstrapped via `ADMIN_PHONES` in `backend/.env`.

## How frontend talks to backend

1. Pages call `frontend/src/services/api/*`.
2. `http.ts` sends requests to `/api/v1/...` with `Authorization: Bearer <accessToken>` and `credentials: include`.
3. Vite proxies `/api` to the Nest server.
4. Nest wraps success payloads as `{ success: true, data }` (streaming Copilot is a special case).
5. Prisma persists to PostgreSQL; RAG uses Qdrant; heavy ingest uses RabbitMQ workers.

## Tech stack (summary)

| Layer | Stack |
|-------|--------|
| UI | React 19, Vite 6, TypeScript, Tailwind, Redux Toolkit, React Router 7 |
| API | NestJS 10, Prisma 6, class-validator, Swagger |
| Data | PostgreSQL, Redis (optional / in-memory fallback), Qdrant, RabbitMQ |
| AI | LangChain — Gemini (dev) / OpenAI (prod), Ollama embeddings (dev) |
| Auth | Passport JWT, bcrypt OTP hashes |

## Documentation map

| Doc | Content |
|-----|---------|
| [backend/README.md](backend/README.md) | Modules, scripts, env, API setup |
| [frontend/README.md](frontend/README.md) | Pages, components, Copilot widget, admin UI |
| [analyse.md](analyse.md) | End-to-end wiring and auth flow |
| [docs/architecture/current-system.md](docs/architecture/current-system.md) | Deeper audit of flows and data model |

## License

UNLICENSED / private — see package manifests.
