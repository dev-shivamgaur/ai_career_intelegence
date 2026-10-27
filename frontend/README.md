# AI Career Intelligence — Frontend

React SPA for learners (private tech + government exam tracks) and an admin console. Talks to the NestJS API via Vite proxy — **not** a mock-only app.

## Prerequisites

- Node.js 20+
- Backend running (see [../backend/README.md](../backend/README.md))

## Quick start

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

```bash
npm run build
npm run preview
```

`vite.config.ts` proxies `/api` → the Nest server so browser calls stay same-origin.

## Demo login

Uses **phone OTP** against the backend (not email/password mocks):

- Phone: `+919876543210`
- OTP: `123456` (development)

Admin UI: `/admin/login` (phones listed in backend `ADMIN_PHONES`).

## Architecture

```
pages/  →  services/api/*  →  services/http.ts  →  /api/v1/* (proxied)
                ↑
         Redux store / ProfileContext / session helpers
```

| Folder | Use case |
|--------|----------|
| `src/pages/` | Route-level screens (Dashboard, Prepare, Sarkari, Admin, …) |
| `src/components/` | Reusable UI: layout, copilot widget, cards, sarkari flags, admin pieces |
| `src/layouts/` | `AppLayout` (learner shell + floating Copilot), `AdminLayout` |
| `src/services/api/` | Typed API clients (`authApi`, `preparationApi`, `appApi` stream, …) |
| `src/services/http.ts` | Axios/fetch wrapper, auth headers, error toasts |
| `src/context/` | Profile provider shared across learner pages |
| `src/store/` | Redux Toolkit (session effects, UI state) |
| `src/routes/` | `ProtectedRoute`, `GuestRoute`, `AdminGate` |
| `src/lib/` | Formatters, fingerprint, Copilot suggestion chips, storage helpers |
| `src/types/` | Shared TypeScript models |
| `src/hooks/` | Data-loading helpers (`useAsyncData`, …) |

## Learner pages (`src/pages/`)

| Page | Use case |
|------|----------|
| `Landing/` | Marketing home; CTAs into login / dashboard / Copilot |
| `Auth/` | Login / signup (OTP) |
| `Onboarding/` | Track + goal setup |
| `Dashboard/` | Snapshot, gaps, jobs, Copilot suggestion chips |
| `Profile/` | Edit profile and career track |
| `Documents/` | Upload resume / certificates / marksheets |
| `CareerAnalysis/` | Fit vs target role |
| `SkillGap/` | Missing / weak skills |
| `Roadmap/` | Ordered prep plan |
| `Prepare/` | Prep Engine UI — packages, version switch, lessons / quiz / tasks |
| `Opportunities/` | Private jobs + government opportunities |
| `Sarkari/` | Exam hub and per-exam pages |
| `Market/` | Market slice UI (feature-flagged) |
| `Research/` | Trigger/store research summaries |
| `Progress/` | Progress over time |
| `Settings/` | Preferences / account |

**AI Copilot** is not a full page anymore. A fixed FAB + resizable panel mounts in `AppLayout` (`components/copilot/`). `/copilot` redirects to `/dashboard?copilot=1`.

## Copilot widget (`src/components/copilot/`)

| File | Role |
|------|------|
| `CopilotWidget.tsx` | FAB, open/close, size shell, `?copilot=1` + `openCopilot()` events |
| `CopilotPanel.tsx` | Chat chrome, suggestions, resize handles |
| `useCopilotChat.ts` | Welcome, chips, streaming via `appApi.streamCopilotMessage` |
| `useCopilotResize.ts` | Drag width/height; sessionStorage size |
| `copilotOpen.ts` | `openCopilot({ q })` for Dashboard chips |
| `Chat.tsx` | Message bubbles, typing indicator, input |

## Admin pages

Under `src/pages/Admin/` — users, careers, skills, jobs, exams, opportunities, market tools, company intel, learning resources, **prep packages** (`/admin/prep`). Guarded by `AdminGate` + `AdminLayout`.

## Product flow (learner)

```
Documents → Profile → Career / exam goal
  → Career analysis + skill gap
  → Roadmap + Prepare (practice with evidence)
  → Jobs / Sarkari vacancies
  → Research → Progress
  → Floating Copilot (any page)
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b` + production bundle |
| `npm run preview` | Serve production build |

## Related docs

- Root [README.md](../README.md) — monorepo overview and stack
- [../backend/README.md](../backend/README.md) — API modules and env
- [../analyse.md](../analyse.md) — auth tokens and proxy details
