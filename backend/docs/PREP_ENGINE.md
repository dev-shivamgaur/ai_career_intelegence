# Skill Preparation Engine

Universal preparation packages are stored as versioned JSON on `PrepPackage`. Learners run per-user `PrepSession` rows. Rubrics never leave admin APIs.

## Learner

- Routes: `/prepare/:skillId`, `/prepare/task/:taskId`
- APIs under `/preparation/*`
- Steps: Overview → Lesson → Practice → Practical (optional) → Review
- Mastery requires passed objectives and required practical tasks (if any). Quiz accuracy alone is not mastery.
- New sessions use the **latest PUBLISHED** package. Learners can switch versions via `GET /preparation/packages` and `POST /preparation/sessions` with `packageVersion` + `switchVersion: true` (abandons the open session; answers do not carry over). UI steps always follow the active session package.

## Admin

- Route: `/admin/prep` (`frontend/src/pages/Admin/AdminPrepPackagesPage.tsx`)
- APIs under `/admin/preparation/*` (`backend/src/admin/admin-preparation.*`)
- Draft → validate → publish (new version). AI generate only fills drafts.
- Learner prep stays in `backend/src/preparation/`; admin authoring lives only in `backend/src/admin/`.

## Seed demo packages

```bash
cd backend
npx prisma migrate deploy
npx ts-node scripts/seed-prep-packages.ts
```

Rich seeds: Prompting Techniques, RAG, Code Reviews, Relational Databases, CI/CD. Other listed skills get thin deterministic packages.
