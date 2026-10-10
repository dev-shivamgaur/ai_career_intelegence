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
- Periods: UTC ISO weeks (Monday 00:00) and calendar months (never overlapping).
- Per-company contribution cap (`demand.companyCapShare`, default 0.2); Wilson 95% interval on the
  capped share; panel membership stored (`MarketPanelMembership`: sources with a completed fetch in
  the period). Complete snapshots are append-only; the open period is replaced until it closes.
- Methodology version `demand-1`. Redis cache key `market:demand:<gen>:…` is invalidated by
  incrementing `market:demand:gen` after each career aggregation. The 20:00 IST scheduler slot
  publishes one `market.aggregate` task per enabled career.

## Trends

- Only `NEW_POSTINGS` on **disjoint** consecutive UTC weeks/months. Each comparison uses the
  **intersection panel** (companies with a successful fetch in both periods) and the same company cap
  as demand, so a source-mix change or one employer's burst cannot create a trend.
- Two-proportion z-test on capped counts; Benjamini–Hochberg across the skills of one career/lane;
  `INCREASING`/`DECREASING` require `confirmSteps` consecutive significant steps in the same direction
  (default 2 steps = 3 periods). `EMERGING` is a low base share with strong relative growth and enough
  companies in the latest period.
- Guards (`minPanelCompanies`, `minTotalJobs`, `minJobCount`) and the cold start (fewer than
  `confirmSteps + 1` complete periods) label `INSUFFICIENT_DATA`. `methodologyVersion = trend-1`; old
  rows are never relabelled in place. Frequency (demand share) and growth (trend label) stay separate.

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
- Demand engine (M9, `methodologyVersion = demand-1`): one SQL population per
  `(careerId, laneKey, period, basis)` over the period's panel companies, then a per-company
  weight `min(1, cap / companyJobs)`. `NEW_POSTINGS` uses `firstSeenAt` inside the bucket;
  `ACTIVE_STOCK` uses jobs open at any time in the bucket. The rolling 90-day current view is
  labelled `ROLLING` and is never a trend input. Admin "Market demand" shows n, companies, panel,
  period and Wilson bounds on every row.
- Trend engine (M10, `methodologyVersion = trend-1`): after each career's demand snapshots, the
  aggregate task recomputes `SkillTrend` for complete NEW_POSTINGS periods. Unit tests cover a changing
  source mix (no trend), a one-company burst (no INCREASING), steady growth over 3 periods (INCREASING),
  and cold start (INSUFFICIENT_DATA). Admin demand page lists labels with n, panel and adjusted p.

### Demand reference SQL (NEW_POSTINGS, `laneKey = 'all'`)

Numbers in `MarketSkillSnapshot` can be reproduced with:

```sql
WITH panel AS (
  SELECT DISTINCT "companyId" FROM market_panel_membership
  WHERE "periodType" = :periodType AND "periodStart" = :periodStart
), pop AS (
  SELECT DISTINCT j.id, j."companyId"
  FROM market_job j JOIN market_job_career c ON c."marketJobId" = j.id
  WHERE c."careerId" = :careerId AND c."laneKey" = 'all'
    AND c.confidence >= :minClassificationConfidence
    AND j."companyId" IN (SELECT "companyId" FROM panel)
    AND j."firstSeenAt" >= :periodStart AND j."firstSeenAt" < :periodEnd
), comp AS (
  SELECT "companyId", COUNT(*)::float AS n FROM pop GROUP BY 1
), cap AS (
  SELECT GREATEST(1, CEIL(:companyCapShare * (SELECT COUNT(*) FROM pop))) AS k
), w AS (
  SELECT comp."companyId", LEAST(1.0, cap.k / comp.n) AS w FROM comp, cap
), tot AS (
  SELECT SUM(comp.n * w.w) AS capped FROM comp JOIN w USING ("companyId")
), js AS (
  SELECT DISTINCT s."skillId", pop.id, pop."companyId"
  FROM market_job_skill s JOIN pop ON pop.id = s."marketJobId"
  WHERE s."skillId" IS NOT NULL AND s.confidence >= :minSkillConfidence
)
SELECT js."skillId", COUNT(*)::int AS jobs, SUM(w.w)::float AS "cappedJobCount",
       (SUM(w.w) / (SELECT capped FROM tot))::float AS "demandPct"
FROM js JOIN w USING ("companyId") GROUP BY js."skillId";
```

Wilson bounds are then `wilson(cappedJobCount, cappedTotal)` with z = 1.96.

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
8. M9: after classification, Admin -> Market demand (or Market runs -> Aggregate demand) writes
   weekly and monthly snapshots on both bases. Reproduce a sample career with the SQL above.
9. M10: the same aggregation writes `SkillTrend` rows. Until three complete NEW_POSTINGS periods
   exist, every label is INSUFFICIENT_DATA. Gate C (turn on `MARKET_UI`) waits for that cold start.
