/**
 * M9 acceptance checks against a SCRATCH database (run via run-integration.ps1, never against dev).
 * Demand snapshots: non-overlapping weekly/monthly buckets on both bases, stable panel, company cap, Wilson interval,
 * confidence thresholds, append-only complete periods, Redis cache, and numbers reproduced by an independent SQL query.
 */
import { PrismaClient } from '../../src/prisma/client';
import { INTEL_DEFAULTS } from '../../src/intel-config/intel-config.defaults';
import { DEMAND_METHODOLOGY_VERSION, wilson } from '../../src/market/demand/demand-math';
import { MarketDemandService } from '../../src/market/demand/market-demand.service';

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
}
const close = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) <= eps;
const D = (s: string) => new Date(`${s}T12:00:00Z`);

/** The documented reference query (docs/architecture/market-intelligence.md), written independently of the service. */
const REFERENCE_SQL = `
WITH panel AS (
  SELECT DISTINCT "companyId" FROM market_panel_membership WHERE "periodType" = $1::"MarketPeriodType" AND "periodStart" = $2::timestamp
), pop AS (
  SELECT DISTINCT j.id, j."companyId"
  FROM market_job j JOIN market_job_career c ON c."marketJobId" = j.id
  WHERE c."careerId" = $4 AND c."laneKey" = 'all' AND c.confidence >= $5::float8
    AND j."companyId" IN (SELECT "companyId" FROM panel)
    AND j."firstSeenAt" >= $2::timestamp AND j."firstSeenAt" < $3::timestamp
), comp AS (
  SELECT "companyId", COUNT(*)::float AS n FROM pop GROUP BY 1
), cap AS (
  SELECT GREATEST(1, CEIL($7::float8 * (SELECT COUNT(*) FROM pop))) AS k
), w AS (
  SELECT comp."companyId", LEAST(1.0, cap.k / comp.n) AS w FROM comp, cap
), tot AS (
  SELECT SUM(comp.n * w.w) AS capped FROM comp JOIN w USING ("companyId")
), js AS (
  SELECT DISTINCT s."skillId", pop.id, pop."companyId"
  FROM market_job_skill s JOIN pop ON pop.id = s."marketJobId"
  WHERE s."skillId" IS NOT NULL AND s.confidence >= $6::float8
)
SELECT js."skillId", COUNT(*)::int AS jobs, COUNT(DISTINCT js."companyId")::int AS companies,
       SUM(w.w)::float AS capped, (SUM(w.w) / (SELECT capped FROM tot))::float AS pct,
       (SELECT COUNT(*) FROM pop)::int AS total, (SELECT capped FROM tot)::float AS "cappedTotal"
FROM js JOIN w USING ("companyId") GROUP BY js."skillId"`;

async function main() {
  if (!/ai_market_it/.test(process.env.DATABASE_URL ?? '')) throw new Error('Refusing to run outside the ai_market_it scratch database');
  const prisma = new PrismaClient();
  const config = { get: async (key: keyof typeof INTEL_DEFAULTS) => INTEL_DEFAULTS[key] };
  const store = new Map<string, string>();
  let sets = 0;
  const redis = {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => {
      sets += 1;
      store.set(k, v);
    },
    incr: async (k: string) => {
      const n = Number(store.get(k) ?? '0') + 1;
      store.set(k, String(n));
      return n;
    },
  };
  const svc = new MarketDemandService(
    prisma as never,
    config as never,
    { register: () => undefined } as never,
    {} as never,
    redis as never,
    { registerSlot: () => undefined } as never,
  );

  const skill: Record<string, string> = {};
  for (const name of ['PostgreSQL', 'Kafka', 'Go']) skill[name] = (await prisma.skill.create({ data: { name, category: 'Core' } })).id;
  const backend = await prisma.career.create({
    data: { slug: 'backend', title: 'Backend', overview: 'fixture', marketExpectations: 'fixture', entryLevelExpectations: 'fixture' },
  });
  await prisma.marketCareerProfile.create({ data: { careerId: backend.id, titlePatterns: ['backend'], excludePatterns: [] } });

  const terms = { termsUrl: 'https://example.invalid/terms', termsSummary: 'SCRATCH DB TEST DATA ONLY - not a real terms review', allowedUses: ['ANALYTICS_AGGREGATE'], enabled: true };
  const company: Record<string, string> = {};
  const source: Record<string, string> = {};
  for (const k of ['A', 'B', 'C', 'D']) {
    company[k] = (await prisma.company.create({ data: { name: `Co ${k}`, slug: `co-${k.toLowerCase()}` } })).id;
    source[k] = (await prisma.marketSource.create({ data: { companyId: company[k], type: 'GREENHOUSE', boardToken: `b${k}`, ...terms } })).id;
  }

  // Successful daily fetches: A, B, C through September and October; D only in October (joins the panel late).
  const run = await prisma.marketRun.create({ data: { kind: 'FETCH', trigger: 'ADMIN', status: 'COMPLETED' } });
  const tasks: Array<{ runId: string; kind: 'FETCH'; sourceId: string; status: 'COMPLETED'; finishedAt: Date }> = [];
  for (let day = new Date('2026-09-01T06:30:00Z'); day < new Date('2026-10-09T00:00:00Z'); day = new Date(day.getTime() + 86_400_000)) {
    for (const k of ['A', 'B', 'C']) tasks.push({ runId: run.id, kind: 'FETCH', sourceId: source[k], status: 'COMPLETED', finishedAt: day });
    if (day >= new Date('2026-10-01')) tasks.push({ runId: run.id, kind: 'FETCH', sourceId: source.D, status: 'COMPLETED', finishedAt: day });
  }
  await prisma.marketTask.createMany({ data: tasks });

  let n = 0;
  type Spec = { co: string; first: string; last: string; closed?: string; conf?: number; lanes?: string[]; skills: Array<[string, 'REQUIRED' | 'RECOMMENDED' | 'NICE_TO_HAVE', number?]> };
  const job = async (s: Spec) => {
    n += 1;
    const mj = await prisma.marketJob.create({
      data: {
        companyId: company[s.co],
        title: `Backend Engineer ${n}`,
        normalizedTitle: 'backend engineer',
        firstSeenAt: D(s.first),
        lastSeenAt: D(s.last),
        closedAt: s.closed ? D(s.closed) : null,
        status: s.closed ? 'CLOSED' : 'OPEN',
        normalizerVersion: 'fixture',
        classificationStatus: 'CLASSIFIED',
      },
    });
    const raw = await prisma.marketRawJob.create({
      data: { sourceId: source[s.co], externalId: `x${n}`, rawTitle: mj.title, contentHash: `h${n}`, marketJobId: mj.id, processingStatus: 'DONE' },
    });
    for (const laneKey of ['all', ...(s.lanes ?? [])]) {
      await prisma.marketJobCareer.create({
        data: { marketJobId: mj.id, careerId: backend.id, laneKey, confidence: s.conf ?? 0.9, method: 'TITLE_PATTERN', classifierVersion: 'fixture' },
      });
    }
    for (const [name, level, confidence] of s.skills) {
      await prisma.marketJobSkill.create({
        data: {
          marketJobId: mj.id,
          rawJobId: raw.id,
          rawName: name,
          normalizedName: name.toLowerCase(),
          skillId: skill[name],
          resolveMethod: 'EXACT',
          level,
          confidence: confidence ?? 0.9,
          method: 'RULE',
          extractorVersion: 'fixture',
        },
      });
    }
  };
  // September: A floods with 10 Kafka jobs; B and C post Go/PostgreSQL; D posts but is not in September's panel.
  for (let i = 0; i < 10; i += 1) await job({ co: 'A', first: '2026-09-10', last: '2026-09-20', closed: '2026-09-21', skills: [['Kafka', 'REQUIRED'], ['PostgreSQL', 'REQUIRED']] });
  for (let i = 0; i < 2; i += 1) await job({ co: 'B', first: '2026-09-15', last: '2026-09-25', closed: '2026-09-26', lanes: ['go'], skills: [['Go', 'REQUIRED'], ['PostgreSQL', 'RECOMMENDED']] });
  for (let i = 0; i < 2; i += 1) await job({ co: 'C', first: '2026-09-22', last: '2026-09-29', closed: '2026-09-30', lanes: ['go'], skills: [['Go', 'NICE_TO_HAVE'], ['PostgreSQL', 'REQUIRED']] });
  for (let i = 0; i < 3; i += 1) await job({ co: 'D', first: '2026-09-12', last: '2026-09-18', closed: '2026-09-19', skills: [['Go', 'REQUIRED']] });
  await job({ co: 'B', first: '2026-09-16', last: '2026-09-20', closed: '2026-09-21', conf: 0.3, skills: [['Kafka', 'REQUIRED']] });
  await job({ co: 'C', first: '2026-09-23', last: '2026-09-24', closed: '2026-09-25', skills: [['Kafka', 'REQUIRED', 0.4], ['PostgreSQL', 'REQUIRED']] });
  // Open since August (before any panel), still open: active stock in Sep and Oct, a new posting only in August.
  await job({ co: 'B', first: '2026-08-15', last: '2026-10-08', skills: [['PostgreSQL', 'REQUIRED']] });
  // October.
  await job({ co: 'A', first: '2026-10-06', last: '2026-10-08', skills: [['PostgreSQL', 'REQUIRED']] });
  for (let i = 0; i < 2; i += 1) await job({ co: 'D', first: '2026-10-06', last: '2026-10-08', skills: [['Go', 'REQUIRED']] });

  const now = new Date('2026-10-09T12:00:00Z');
  const res = await svc.aggregateCareer(backend.id, now);
  check('aggregation writes career and skill snapshots', res.careerSnapshots > 0 && res.skillSnapshots > 0, res);

  const sep = new Date('2026-09-01T00:00:00Z');
  const oct = new Date('2026-10-01T00:00:00Z');
  const panelSep = await prisma.marketPanelMembership.findMany({ where: { periodType: 'MONTH', periodStart: sep } });
  const panelOct = await prisma.marketPanelMembership.findMany({ where: { periodType: 'MONTH', periodStart: oct } });
  check('panel membership: September has A, B, C; October adds D', panelSep.length === 3 && !panelSep.some((p) => p.sourceId === source.D) && panelOct.length === 4, {
    sep: panelSep.length,
    oct: panelOct.length,
  });
  check('no snapshot for a period without a panel (August)', (await prisma.marketCareerSnapshot.count({ where: { periodType: 'MONTH', periodStart: new Date('2026-08-01T00:00:00Z') } })) === 0);

  const snapKey = (basis: 'NEW_POSTINGS' | 'ACTIVE_STOCK', periodStart: Date, laneKey = 'all', periodType: 'WEEK' | 'MONTH' = 'MONTH') => ({
    periodType,
    periodStart,
    basis,
    careerId: backend.id,
    laneKey,
    methodologyVersion: DEMAND_METHODOLOGY_VERSION,
  });
  const sepNew = await prisma.marketCareerSnapshot.findUniqueOrThrow({ where: { periodType_periodStart_basis_careerId_laneKey_methodologyVersion: snapKey('NEW_POSTINGS', sep) } });
  check('September NEW_POSTINGS: panel only, confident classifications only, company cap applied', sepNew.isComplete && sepNew.totalJobs === 15 && sepNew.capJobs === 3 && sepNew.cappedTotal === 8 && sepNew.companyCount === 3 && sepNew.panelCompanies === 3, sepNew);
  const sepSkills = await prisma.marketSkillSnapshot.findMany({ where: snapKey('NEW_POSTINGS', sep) });
  const s = (name: string) => sepSkills.find((x) => x.skillName === name)!;
  check('Kafka: one flooding company is capped; low-confidence skill row ignored', s('Kafka').jobCount === 10 && s('Kafka').cappedJobCount === 3 && close(s('Kafka').demandPct, 3 / 8) && s('Kafka').companyCount === 1, s('Kafka'));
  check('Go: required/nice split, D excluded (not in panel)', s('Go').jobCount === 4 && s('Go').requiredCount === 2 && s('Go').niceCount === 2 && close(s('Go').demandPct, 4 / 8), s('Go'));
  const ci = wilson(3, 8);
  check('Wilson interval stored with n = capped total', close(s('Kafka').wilsonLower, ci.lower, 1e-4) && close(s('Kafka').wilsonUpper, ci.upper, 1e-4));
  check(
    'every skill row carries n, companies, panel, period and confidence',
    sepSkills.every((x) => x.totalJobs === 15 && x.companyCount > 0 && x.panelCompanies === 3 && x.periodEnd > x.periodStart && x.wilsonUpper >= x.demandPct && x.wilsonLower <= x.demandPct),
  );

  const ref = await prisma.$queryRawUnsafe<Array<{ skillId: string; jobs: number; companies: number; capped: number; pct: number; total: number; cappedTotal: number }>>(
    REFERENCE_SQL,
    'MONTH',
    '2026-09-01 00:00:00',
    '2026-10-01 00:00:00',
    backend.id,
    INTEL_DEFAULTS.demand.minClassificationConfidence,
    INTEL_DEFAULTS.demand.minSkillConfidence,
    INTEL_DEFAULTS.demand.companyCapShare,
  );
  const mismatches = ref.filter((r) => {
    const row = sepSkills.find((x) => x.skillId === r.skillId);
    return !row || row.jobCount !== r.jobs || row.companyCount !== r.companies || !close(row.cappedJobCount, r.capped) || !close(row.demandPct, r.pct) || row.totalJobs !== r.total || !close(row.cappedTotal, r.cappedTotal);
  });
  check('snapshot reproduced by the reference SQL', ref.length === sepSkills.length && mismatches.length === 0, { ref: ref.length, rows: sepSkills.length, mismatches });

  const sepActive = await prisma.marketCareerSnapshot.findUniqueOrThrow({ where: { periodType_periodStart_basis_careerId_laneKey_methodologyVersion: snapKey('ACTIVE_STOCK', sep) } });
  const octNew = await prisma.marketCareerSnapshot.findUniqueOrThrow({ where: { periodType_periodStart_basis_careerId_laneKey_methodologyVersion: snapKey('NEW_POSTINGS', oct) } });
  const octActive = await prisma.marketCareerSnapshot.findUniqueOrThrow({ where: { periodType_periodStart_basis_careerId_laneKey_methodologyVersion: snapKey('ACTIVE_STOCK', oct) } });
  check('bases kept apart: the August job is active stock in Sep and Oct, never a Sep/Oct new posting', sepActive.totalJobs === 16 && octNew.totalJobs === 3 && octActive.totalJobs === 4 && !octNew.isComplete, {
    sepActive: sepActive.totalJobs,
    octNew: octNew.totalJobs,
    octActive: octActive.totalJobs,
  });
  const goLane = await prisma.marketCareerSnapshot.findUnique({ where: { periodType_periodStart_basis_careerId_laneKey_methodologyVersion: snapKey('NEW_POSTINGS', sep, 'go') } });
  check('lane snapshots', goLane?.totalJobs === 4, goLane?.totalJobs);

  const weekly = await prisma.marketCareerSnapshot.findMany({ where: { careerId: backend.id, laneKey: 'all', basis: 'NEW_POSTINGS', periodType: 'WEEK' } });
  const monthly = await prisma.marketCareerSnapshot.findMany({ where: { careerId: backend.id, laneKey: 'all', basis: 'NEW_POSTINGS', periodType: 'MONTH' } });
  const sum = (xs: Array<{ totalJobs: number }>) => xs.reduce((a, b) => a + b.totalJobs, 0);
  const sorted = [...weekly].sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
  check(
    'weekly buckets do not overlap and count every new posting once',
    sorted.every((w, i) => i === 0 || w.periodStart.getTime() >= sorted[i - 1].periodEnd.getTime()) && sum(weekly) === sum(monthly),
    { weekly: sum(weekly), monthly: sum(monthly) },
  );

  const sepComputedAt = sepNew.computedAt.getTime();
  await job({ co: 'C', first: '2026-09-24', last: '2026-09-25', closed: '2026-09-26', skills: [['Go', 'REQUIRED']] });
  const later = new Date('2026-10-09T13:00:00Z');
  await svc.aggregateCareer(backend.id, later);
  const sepAgain = await prisma.marketCareerSnapshot.findUniqueOrThrow({ where: { periodType_periodStart_basis_careerId_laneKey_methodologyVersion: snapKey('NEW_POSTINGS', sep) } });
  const octAgain = await prisma.marketCareerSnapshot.findUniqueOrThrow({ where: { periodType_periodStart_basis_careerId_laneKey_methodologyVersion: snapKey('NEW_POSTINGS', oct) } });
  check('complete periods are append-only; the open period is replaced', sepAgain.computedAt.getTime() === sepComputedAt && sepAgain.totalJobs === 15 && octAgain.computedAt.getTime() === later.getTime());

  const view = await svc.careerDemand(backend.id, { periodType: 'MONTH', basis: 'NEW_POSTINGS', periodStart: sep.toISOString() });
  const setsAfterFirst = sets;
  await svc.careerDemand(backend.id, { periodType: 'MONTH', basis: 'NEW_POSTINGS', periodStart: sep.toISOString() });
  check('admin view: provenance on the snapshot and every skill', !!view.snapshot && view.snapshot.n === 15 && view.snapshot.companies === 3 && view.snapshot.panel.companies === 3 && view.skills.every((k) => k.n === 15 && k.companies > 0 && k.panelCompanies === 3 && !!k.period && k.confidence.method === 'wilson95'));
  check('second read is served from the cache', sets === setsAfterFirst);
  await svc.handle({ taskId: 't', runId: 'r', queue: 'market.aggregate', attempt: 1, payload: { careerId: backend.id } });
  await svc.careerDemand(backend.id, { periodType: 'MONTH', basis: 'NEW_POSTINGS', periodStart: sep.toISOString() });
  check('aggregation bumps the cache generation', sets === setsAfterFirst + 1 && store.get('market:demand:gen') === '1');

  const current = await svc.currentDemand(backend.id, {}, now);
  check('current demand: rolling active stock with its own panel', current.snapshot.period.type === 'ROLLING' && current.snapshot.panel.sources === 4 && current.snapshot.n > 0, current.snapshot);

  let rejected = false;
  try {
    await svc.careerDemand(backend.id, { basis: 'EVERYTHING' });
  } catch {
    rejected = true;
  }
  check('invalid basis rejected', rejected);

  await prisma.$disconnect();
  console.log(failures === 0 ? 'M9 INTEGRATION PASSED' : `M9 INTEGRATION FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
