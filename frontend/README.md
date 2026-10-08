# AI Career Intelligence

Evidence-based career intelligence frontend for students, freshers, and early-career professionals.

This repository contains **only the React frontend**. All AI, OCR, search, and authentication behavior is mocked locally so the app runs without API keys, environment variables, or a backend.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

Build:

```bash
npm run build
npm run preview
```

## Demo login

- Email: `shivam@demo.local`
- Password: any value with at least 4 characters
- Or use **Continue with Google** (mock) to enter the demo user

A **Demo Mode** banner appears for the seeded BCA / Backend Developer profile.

## Architecture

Pages call `src/services/api/*`, which currently re-export `src/services/mock/*`.

To connect a NestJS API later, replace the mock implementations inside those API modules. UI pages should not need a rewrite.

Mock datasets live in `src/data/` and stay internally consistent with the demo profile.

Session, theme, preferences, roadmap task status, and notifications use `src/lib/storage.ts` (`localStorage` with an `aci:` prefix). Uploaded document **files** are not written to `localStorage`.

## Product flow

Documents → Personal profile → Career goal → Career requirements → Skill gap → Market research → Evidence → Roadmap → Jobs / government opportunities → Progress → Copilot
