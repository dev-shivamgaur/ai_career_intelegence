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

## Implementation notes (as built)

- `market.process` runs one task per source that processes up to 100 raw rows through the stage
  registry (`dedupe` PENDING->DEDUPED, `extract` DEDUPED->EXTRACTED, `classify` EXTRACTED->DONE) and
  enqueues a follow-up task while rows remain. A failing row is marked FAILED; the batch continues.
- Title patterns live in `MarketCareerProfile` (1:1 with `Career`) instead of a
  `Career.marketTitlePatterns` column, so existing career responses stay unchanged.
- Additive columns from M1 (`Skill.normalizedName`, `Skill.domainId`, and
  `CareerSkillRequirement.source/sourceRef/lastSeenAt`) do appear in existing responses that return
  whole rows; they are nullable/defaulted and no existing field changed.
- Extraction: rule pass (curated seed + market vocabulary + approved aliases + domain skills,
  section-aware levels) and an optional LLM pass whose quotes must be found verbatim in the text.
  Every `MarketJobSkill` stores an evidence span; the excerpt follows the source retention policy.
- Unresolved names are upserted as `SkillCandidate` (counts recomputed, never incremented).
- Skill review (M7, admin "Skill review" page): suggestions come from an in-memory embedding index of
  skill names (`EmbeddingService`, no vector DB) and, when `IntelConfig resolver.llmSuggest` is on,
  an LLM choice restricted to that shortlist. Auto-mapping (`resolver.autoApprove`) is off by default
  and flags what it maps. Approve-as-new refuses names that already resolve, so market ingestion
  never creates duplicate `Skill` rows. Map/approve relink pending `MarketJobSkill` rows in the same
  transaction (bounded to one name); reject removes them and extraction drops the name afterwards.
  The skill merge tool is a dry run unless `execute: true`, runs in one transaction, keeps the
  target's row when both skills have an equivalent row, and writes `SkillReviewLog`.
- `MARKET_LLM_EXTRACTION` additionally needs a configured LLM; the daily budget is
  `IntelConfig extraction.llmDailyLimit` (Redis counter `market:llm:<date>`).
- Career classification (M8, `classifierVersion = career-2`): for each career with an enabled
  profile, `confidence = titleWeight * [title pattern matches] + skillOverlapWeight * overlap`,
  where overlap is the share of the job's resolved skills (confidence >= `demand.minSkillConfidence`)
  that the career's `CareerSkillRequirement` rows contain; overlap is ignored below 3 resolved
  skills. Exclusion patterns veto a career outright. Candidates (a title match, or overlap >= 0.5)
  are all stored with their confidence; lanes (`Career.stackLanes` keywords, whole-word, title
  weighted over skills) get their own rows (`laneKey = <lane id>`) only above
  `classification.minConfidence`. A job is ambiguous when no candidate reaches the threshold but
  some overlap is >= 0.5; only then, and only with `classification.llmFallback` on, a configured LLM
  and the shared daily budget, the LLM chooses among those candidates (method `LLM`, confidence
  capped at 0.85). Admin rows are never overwritten.
- Every demand-facing query (slice summary, career skills, drill-down, profile counts, label
  export, quality gate) counts only `laneKey = 'all'` rows with confidence >=
  `demand.minClassificationConfidence`; lane views filter on the lane key instead.

## M6 vertical slice runbook and quality gate

1. Admin -> Market sources: add 5-10 companies across Greenhouse, Lever and Ashby; record each
   terms review; test-fetch; enable.
2. Admin -> Market slice: set title patterns for Backend and Frontend ("Use suggestions" is a
   starting point), save.
3. With `MARKET_PIPELINE_ENABLED=true` and a worker on `WORKER_QUEUES=career,market`, run
   "Fetch all enabled" from Market runs (scheduler stays off). Processing follows automatically.
4. Review the slice report: top skills per career with drill-down to jobs, sources and evidence;
   unclassified titles; unresolved names. Counts are raw `ACTIVE_STOCK` counts; no percentages
   or trends are published from the slice.
5. Labelled sample (50-100 jobs):
   `npx ts-node scripts/market/export-label-sample.ts --size 60 --out <file>`; correct each
   item's `label` and set `labelled: true`. The file contains posting text: keep it local.
6. Gate: `npx ts-node scripts/market/quality-gate.ts --file <file>` prints each check and
   `VERDICT: GO|FIX`. Proposed targets (to confirm): extraction precision >= 0.85, recall >= 0.70,
   classification precision >= 0.90, 0 false merges, unresolved-skill rate < 20%, 3 consecutive
   clean daily fetch runs. Scale Gate A (about 25 companies) opens only on GO.
7. M8 accept (classification precision >= 0.90) is checked with the same labelled file after
   "Reclassify" has run with the career-2 classifier; predicted careers are the rows that demand
   counts (`--min-confidence` overrides the default threshold for experiments).
