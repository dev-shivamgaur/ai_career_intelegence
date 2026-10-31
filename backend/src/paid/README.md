# Paid (backend)

Account plan limits and paywall helpers live here — keep billing/plan logic out of feature modules.

| File | Role |
|------|------|
| `plan-limits.ts` | FREE/PAID resume upload caps from env |
| `prep-llm-limits.ts` | Daily prep LLM generate/grade caps by plan |
| `resume-quota.service.ts` | Assert / bump / read resume upload quota |
| `paid.controller.ts` | `GET /api/v1/paid/resume-quota` |
| `paid.module.ts` | Nest wiring |

Documents still call `ResumeQuotaService` on upload; UI should prefer `/paid/resume-quota`.
