# AI Career Intelligence — Backend

NestJS modular monolith with Prisma, PostgreSQL, Redis abstraction, phone OTP auth, and local/mock AI providers (no API keys required).

## Prerequisites

- Node.js 20+
- Docker (for Postgres + Redis)

## Quick start

```bash
# From repo root
docker compose up -d

cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/v1/docs`

## Auth (development)

When `NODE_ENV=development`, `POST /api/v1/auth/send-otp` may return the OTP in the response body. OTPs are stored bcrypt-hashed in Postgres.

## Auth flow

1. `POST /auth/send-otp` `{ "phone": "+919876543210" }`
2. `POST /auth/verify-otp` `{ "phone": "+919876543210", "code": "123456" }` → access JWT + refresh token (HttpOnly cookie `refresh_token`, also in body)
3. Use `Authorization: Bearer <accessToken>` on protected routes
4. `POST /auth/refresh` (cookie or `{ "refreshToken" }`)
5. `POST /auth/logout`, `GET /auth/me`

CORS allows `http://localhost:5173` with credentials.

## Key modules

`auth`, `users`, `profiles`, `documents`, `careers`, `skill-gap`, `roadmap`, `jobs`, `opportunities/government`, `research`, `ai`, `rag`, `copilot`, `progress`, `notifications`, `prisma`, `storage`, `redis`

AI/LLM/RAG use mock providers under `src/ai` and `src/rag`. Redis no-ops to in-memory if `REDIS_URL` is unset or Redis is down. Uploads go to local `uploads/` (S3-ready interface).

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile NestJS |
| `npm run start:dev` | Watch mode |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Run migrations |
| `npm test` | Jest (passWithNoTests) |
