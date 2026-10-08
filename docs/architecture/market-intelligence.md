# Market Intelligence Layer (MVP design)

The Market Intelligence layer is additive. With all `MARKET_*` flags off, the application behaves
exactly as described in `current-system.md`.

## Principles

- Roadmap knowledge, market observations, admin requirements and company requirements are stored
  separately and never overwrite each other. Market data never writes `CareerSkillRequirement`
  except through an explicit admin "promote" action (`source = ADMIN`).
- Deterministic code computes every number. LLMs only extract skills from text, suggest skill
  mappings, and resolve ambiguous classifications.
- robots.txt is a crawl-policy signal, never legal permission. Every source needs a recorded
  Terms of Service review before it can be enabled.
- Raw text retention is source-aware and configurable; structured results survive purges.
- Trends come only from disjoint periods on a stable company panel.

## Modules (`backend/src`)

| Module | Responsibility |
|--------|----------------|
| `skill-intel/` | `SkillDomain`, `SkillAlias`, `SkillCandidate`, `SkillResolverService`, normalization helpers |
| `market/` | Sources, connectors, HTTP client, raw ingestion, normalization, dedupe, extraction, classification, demand, trends, roadmap-vs-market, market queue + scheduler |
| `intel-config/` | `IntelConfig` key/value thresholds and weights with defaults |

## Pipeline

```
MarketScheduler (06:00 IST) / admin "run now"
  -> market.fetch  (one task per source)
       Connector.fetch -> MarketHttpClient (allowlist, robots, rate limit)
       upsert MarketRawJob by (sourceId, externalId); contentHash change detection
       mark jobs missing from the board as closed
  -> market.process (one task per raw job; stage checkpoints in processingStatus)
       normalize -> dedupe (MarketJob) -> extract (MarketJobSkill) -> resolve -> classify (MarketJobCareer)
  -> market.aggregate (20:00 IST; one task per career)
       demand snapshots (NEW_POSTINGS + ACTIVE_STOCK, weekly + monthly buckets) -> trends
  -> market.retention (nightly) purges raw text per source policy
Failures: market.retry (TTL) -> back to queue; after max attempts -> market.*.dlq
```

## Queue topology (separate `MarketRabbitConnection`)

- Exchange `market.pipeline` (direct); queues `market.fetch`, `market.process`,
  `market.aggregate`, `market.retention`.
- DLX `market.pipeline.dlx`; DLQs `market.fetch.dlq`, `market.process.dlq`,
  `market.aggregate.dlq`, `market.retention.dlq`.
- Retry exchange `market.retry` with per-queue retry queues that dead-letter back after a TTL.
- Consumers run only when the worker's `WORKER_QUEUES` includes `market` (default: `career`).

## Compliance model

`MarketSource` fields: `termsUrl`, `termsReviewedAt`, `termsReviewedBy`, `termsSummary`,
`allowedUses`, `attributionRequired`, `termsReviewDueAt`; retention fields `storeRawPayload`,
`rawPayloadRetentionDays`, `descriptionRetentionDays`, `evidenceExcerptMaxChars`,
`displayPolicy`. Enabling is refused without a valid review. Sources can only be stricter than
the global defaults in `IntelConfig`.

## Demand

- Basis `NEW_POSTINGS`: jobs whose `firstSeenAt` is inside the period. Used for trends.
- Basis `ACTIVE_STOCK`: jobs open at any time in the period. Used for display.
- Periods: ISO weeks and calendar months (never overlapping).
- Per-company contribution cap; Wilson lower bound as confidence; panel membership stored.

## Trends

Disjoint consecutive periods, stable company panel (companies successfully fetched in every
compared period), company cap, minimum samples, two-proportion z-test with Benjamini-Hochberg
correction across skills of a career/lane, confirmation over consecutive steps, and
`methodologyVersion` on every row. Until enough periods exist the label is `INSUFFICIENT_DATA`.

## Feature flags (all default off)

`MARKET_PIPELINE_ENABLED`, `MARKET_SCHEDULER_ENABLED`, `MARKET_LLM_EXTRACTION`, `MARKET_UI`,
`MARKET_SKILL_GAP_FIELD`, and worker `WORKER_QUEUES`.
