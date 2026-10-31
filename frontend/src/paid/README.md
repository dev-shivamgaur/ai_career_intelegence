# Paid (frontend)

UI and API clients for FREE vs PAID account limits.

| File | Role |
|------|------|
| `types.ts` | `ResumeQuota`, `AccountPlan` |
| `paidApi.ts` | `GET /paid/resume-quota` (+ fallback to `/documents/quota`) |
| `PlanCard.tsx` | Settings plan explanation |
| `ResumeQuotaBanner.tsx` | Documents page usage / warnings |
| `index.ts` | Public exports |

Import from `@/paid` in pages — do not scatter plan copy into unrelated modules.
