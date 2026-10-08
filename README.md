# AI Career Intelligence

Monorepo for a career intelligence product that helps learners answer: which role to target, what skills are missing, what to learn next, which jobs/government opportunities fit, and how to improve evidence on a resume.

## Layout

| Path | Description |
|------|-------------|
| `frontend/` | React (Vite) UI — previously mock-driven |
| `backend/` | NestJS modular monolith API (`/api/v1/*`) |
| `docker-compose.yml` | PostgreSQL (pgvector image) + Redis |

## Quick start

```bash
# Infrastructure
docker compose up -d

# Backend
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- API + Swagger: `http://localhost:3000/api/v1/docs`

Postgres URL (local):

```
DATABASE_URL="postgresql://postgres:shivam.gaur@localhost:5432/ai?schema=public"
```

Create database `ai` if needed. Full explanation: see `analyse.md`.

### Demo login

- Phone: `+919876543210`
- OTP: `123456` (development)

See `backend/README.md` for full API setup notes.
