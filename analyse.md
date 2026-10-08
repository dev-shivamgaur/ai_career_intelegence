# AI Career Intelligence — Project Analysis

This document explains the full project: what it is, how the React frontend and NestJS backend are connected, and how to run it with your local PostgreSQL database.

## 1. Product in one sentence

**AI Career Intelligence** is an evidence-based career platform. It does not promise a job. It compares a user’s profile with a target career, shows skill gaps, a roadmap, mock job/government matches, research evidence, and a copilot.

Core flow:

```
Phone OTP login
  → Profile
  → Documents
  → Career goal
  → Career analysis (platform estimated match)
  → Skill gaps
  → Research / evidence
  → Roadmap
  → Jobs + government opportunities
  → Progress
  → AI Copilot
```

## 2. Repository layout

```
AI/
├── analyse.md                 ← this file
├── docker-compose.yml         ← optional Postgres/Redis
├── frontend/                  ← React + Vite + TypeScript + Redux Toolkit
└── backend/                   ← NestJS + Prisma + PostgreSQL
```

Frontend and backend have **separate `node_modules`**. Do not install dependencies at the repo root.

## 3. How frontend talks to backend

The UI does not use local mock JSON as the source of truth.

1. Pages call functions in `frontend/src/services/api/` (auth, profile, documents, career, jobs, research, copilot, progress, notifications).
2. Those functions use `frontend/src/services/http.ts`.
3. `http.ts` calls **`/api/v1/...`** with:
   - `Authorization: Bearer <accessToken>`
   - `credentials: include` (refresh cookie)
4. Vite **proxies** `/api` → `http://localhost:3000` (`frontend/vite.config.ts`).
5. NestJS serves `/api/v1` and wraps responses as `{ success: true, data }`.
6. Prisma reads/writes PostgreSQL.

Token storage (frontend):

- Access token: `localStorage` key `aci:accessToken`
- Refresh token: `aci:refreshToken` plus HttpOnly cookie `refresh_token`
- Passwords are **not** used or stored

## 4. Authentication (email replaced by mobile OTP)

Backend contract:

| Method | URL | Purpose |
|--------|-----|---------|
| POST | `/api/v1/auth/send-otp` | Send OTP to E.164 phone (`+91XXXXXXXXXX`) |
| POST | `/api/v1/auth/verify-otp` | Verify `{ phone, code, name? }`, issue JWT |
| POST | `/api/v1/auth/refresh` | Rotate refresh token |
| POST | `/api/v1/auth/logout` | Revoke refresh token |
| GET | `/api/v1/auth/me` | Current user |

Development:

- Phone: `+919876543210` (seeded demo user **Shivam**)
- OTP: **`123456` always accepted** when `NODE_ENV=development`
- `send-otp` also returns the OTP in the JSON body in development only

Frontend routes:

- `/login` — mobile + OTP (not email/password)
- `/signup` — name + mobile + OTP
- Demo button calls the same OTP APIs for `+919876543210`

## 5. Every frontend URL → backend API

| Frontend route | Data from backend |
|----------------|-------------------|
| `/` | Static landing (links to login/signup) |
| `/login` | `POST /auth/send-otp`, `POST /auth/verify-otp` |
| `/signup` | same OTP APIs; first verify creates user + empty profile |
| `/onboarding` | `POST /profile/complete-onboarding` |
| `/dashboard` | `GET /profile`, `/career-analysis`, `/skill-gaps`, `/roadmap`, `/jobs/matches`, `/government-opportunities`, `/research` |
| `/profile` | `GET/PATCH /profile` |
| `/documents` | `GET/POST/DELETE /documents`, `GET /documents/:id/extraction` |
| `/career-analysis` | `GET /career-analysis`, `GET /careers/:slug`, `GET /skill-gaps` |
| `/skill-gap` | `GET /skill-gaps` |
| `/roadmap` | `GET /roadmap`, `PATCH /roadmap/tasks/:id` |
| `/opportunities` | jobs + government endpoints |
| `/jobs` | `GET /jobs/matches` (fallback `GET /jobs`) |
| `/government-opportunities` | `GET /government-opportunities` |
| `/research` | `GET /research`, `POST /research` |
| `/copilot` | `POST /copilot/chat` |
| `/progress` | `GET /progress` |
| `/settings` | `PATCH /profile`, `DELETE /documents`, `POST /auth/logout` |

Protected app pages send the JWT. Unauthenticated users are sent to `/login`.

## 6. PostgreSQL connection (your URL)

Backend uses:

```
DATABASE_URL="postgresql://postgres:shivam.gaur@localhost:5432/ai?schema=public"
```

This is stored in `backend/.env` (gitignored) and `backend/.env.example`.

- Database name: **`ai`**
- User: **`postgres`**
- Host: **`localhost:5432`**

Create the database once if it does not exist:

```sql
CREATE DATABASE ai;
```

Then from `backend/`:

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed
npm run start:dev
```

Seed creates the demo user, careers, skill gaps, roadmap, jobs, government rows, notifications, and progress snapshot.

## 7. How to run both sides

Terminal 1 — API (port 3000):

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```

Swagger: http://localhost:3000/api/v1/docs

Terminal 2 — UI (port 5173):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 → Log in with `+919876543210` / OTP `123456`.

Postgres must be running locally. Redis is optional.

## 8. Frontend architecture

- **Routing:** `createBrowserRouter` in `frontend/src/main.tsx` (not `App.tsx`)
- **State:** Redux Toolkit slices `auth`, `theme`, `toast` (Context API removed)
- **Pages** stay thin; they call `services/api/*`
- **Mappers** convert Prisma enums (`HIGH`, `D30`, `FRESHER`) to UI values (`high`, `30d`, `fresher`)

## 9. Backend architecture

NestJS modular monolith:

`auth`, `users`, `profiles`, `documents`, `careers`, `skill-gap`, `roadmap`, `jobs`, `government`, `research`, `ai`, `rag`, `copilot`, `progress`, `notifications`

- Prisma = source of truth
- JWT access (short) + refresh rotation
- OTP hashed with bcrypt; raw OTP is never stored
- LLM / embeddings / research are **mock providers** until real keys are added
- File uploads go to `backend/uploads/` (not the browser’s localStorage)

## 10. What is still an estimate (by design)

- Career “match %” is a **platform estimated match**, not a hiring probability
- Skill-gap hours are estimates
- Job listings and government cards are **demo/seed data** unless you later plug in live sources
- Copilot answers from local profile + mock/RAG context, not live web search

## 11. Typical problems

| Symptom | Check |
|---------|--------|
| Login fails / network error | Backend on :3000, Vite proxy, CORS origin `http://localhost:5173` |
| Prisma cannot connect | Postgres running, database `ai` exists, `DATABASE_URL` matches |
| Empty dashboard after new phone | Finish onboarding; demo phone is pre-seeded |
| OTP rate limit | Wait 60s or restart API |
| 401 on every page | Log in again; Bearer token is required |

## 12. Future production upgrades

- Replace mock OTP with SMS (MSG91 / Twilio) behind the same `send-otp` API
- Replace mock LLM with a real provider in `backend/src/ai/`
- Move uploads to S3 via `storage` abstraction
- pgvector + real embeddings for RAG
- Background jobs (BullMQ) for document and research pipelines
