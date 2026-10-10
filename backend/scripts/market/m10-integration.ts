/**
 * M10 acceptance checks against a SCRATCH database (run via run-integration.ps1, never against dev).
 * Trends: cold start → INSUFFICIENT_DATA; source-mix change and one-company burst → no INCREASING;
 * steady growth over 3 complete months → INCREASING. Trends use NEW_POSTINGS on the intersection panel only.
 */
import { PrismaClient } from '../../src/prisma/client';
import { INTEL_DEFAULTS } from '../../src/intel-config/intel-config.defaults';
import { MarketDemandService } from '../../src/market/demand/market-demand.service';
import { TREND_METHODOLOGY_VERSION } from '../../src/market/trend/trend-math';
import { MarketTrendService } from '../../src/market/trend/market-trend.service';

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
}
const D = (s: string) => new Date(`${s}T12:00:00Z`);

async function main() {
  if (!/ai_market_it/.test(process.env.DATABASE_URL ?? '')) throw new Error('Refusing to run outside the ai_market_it scratch database');
  const prisma = new PrismaClient();
  const trendCfg = {
    ...INTEL_DEFAULTS.trend,
    minPanelCompanies: 3,
    minTotalJobs: 20,
    minJobCount: 3,
    confirmSteps: 2,
  };
  const config = {
    get: async (key: keyof typeof INTEL_DEFAULTS) => (key === 'trend' ? trendCfg : INTEL_DEFAULTS[key]),
  };
  const redis = { get: async () => null, set: async () => undefined, incr: async () => 1 };
  const demand = new MarketDemandService(
    prisma as never,
    config as never,
    { register: () => undefined } as never,
    {} as never,
    redis as never,
    { registerSlot: () => undefined } as never,
  );
  const trends = new MarketTrendService(prisma as never, config as never, demand);
  trends.onModuleInit();

  const skill: Record<string, string> = {};
  for (const name of ['PostgreSQL', 'Kafka', 'Go', 'Rust']) {
    skill[name] = (await prisma.skill.create({ data: { name, category: 'Core' } })).id;
  }
  const backend = await prisma.career.create({
    data: { slug: 'backend', title: 'Backend', overview: 'fixture', marketExpectations: 'fixture', entryLevelExpectations: 'fixture' },
  });
  await prisma.marketCareerProfile.create({ data: { careerId: backend.id, titlePatterns: ['backend'], excludePatterns: [] } });

  const terms = {
    termsUrl: 'https://example.invalid/terms',
    termsSummary: 'SCRATCH DB TEST DATA ONLY - not a real terms review',
    allowedUses: ['ANALYTICS_AGGREGATE'],
    enabled: true,
  };
  const company: string[] = [];
  const source: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    company.push((await prisma.company.create({ data: { name: `Co ${i}`, slug: `co-${i}` } })).id);
    source.push(
      (await prisma.marketSource.create({ data: { companyId: company[i], type: 'GREENHOUSE', boardToken: `b${i}`, ...terms } })).id,
    );
  }

  const run = await prisma.marketRun.create({ data: { kind: 'FETCH', trigger: 'ADMIN', status: 'COMPLETED' } });
  // Successful fetches for companies 0..4 across Jul–Sep; company 5 only in September (source-mix change).
  const tasks: Array<{ runId: string; kind: 'FETCH'; sourceId: string; status: 'COMPLETED'; finishedAt: Date }> = [];
  for (const month of ['2026-07', '2026-08', '2026-09']) {
    for (let day = 1; day <= 28; day += 7) {
      const when = new Date(`${month}-${String(day).padStart(2, '0')}T06:30:00Z`);
      for (let i = 0; i < 5; i += 1) tasks.push({ runId: run.id, kind: 'FETCH', sourceId: source[i], status: 'COMPLETED', finishedAt: when });
      if (month === '2026-09') tasks.push({ runId: run.id, kind: 'FETCH', sourceId: source[5], status: 'COMPLETED', finishedAt: when });
    }
  }
  await prisma.marketTask.createMany({ data: tasks });

  let n = 0;
  const job = async (opts: {
    co: number;
    first: string;
    skills: Array<[string, number?]>;
  }) => {
    n += 1;
    const mj = await prisma.marketJob.create({
      data: {
        companyId: company[opts.co],
        title: `Backend Engineer ${n}`,
        normalizedTitle: 'backend engineer',
        firstSeenAt: D(opts.first),
        lastSeenAt: D(opts.first),
        closedAt: D(opts.first),
        status: 'CLOSED',
        normalizerVersion: 'fixture',
        classificationStatus: 'CLASSIFIED',
      },
    });
    const raw = await prisma.marketRawJob.create({
      data: {
        sourceId: source[opts.co],
        externalId: `x${n}`,
        rawTitle: mj.title,
        contentHash: `h${n}`,
        marketJobId: mj.id,
        processingStatus: 'DONE',
      },
    });
    await prisma.marketJobCareer.create({
      data: {
        marketJobId: mj.id,
        careerId: backend.id,
        laneKey: 'all',
        confidence: 0.9,
        method: 'TITLE_PATTERN',
        classifierVersion: 'fixture',
      },
    });
    for (const [name, conf] of opts.skills) {
      await prisma.marketJobSkill.create({
        data: {
          marketJobId: mj.id,
          rawJobId: raw.id,
          rawName: name,
          normalizedName: name.toLowerCase(),
          skillId: skill[name],
          resolveMethod: 'EXACT',
          level: 'REQUIRED',
          confidence: conf ?? 0.9,
          method: 'RULE',
          extractorVersion: 'fixture',
        },
      });
    }
  };

  // --- Scenario A: flat PostgreSQL demand across Jul/Aug/Sep on the stable panel (0..4).
  // Company 5 joins in Sep with many Kafka jobs (source mix + burst) — must not create an INCREASING Kafka trend on the intersection.
  // Constant population (5 companies × 8 jobs) every month. Every job asks for PostgreSQL (STABLE share ≈ 1).
  // A growing subset also asks for Go (INCREASING). Rust appears late (EMERGING).
  // Jul base share 16/40 = 0.4 (> emergingMaxBaseShare) so confirmed growth labels INCREASING, not EMERGING.
  const goCount: Record<string, number> = { '2026-07-10': 2, '2026-08-10': 5, '2026-09-10': 8 };
  const rustCount: Record<string, number> = { '2026-07-10': 0, '2026-08-10': 1, '2026-09-10': 4 };
  for (const month of ['2026-07-10', '2026-08-10', '2026-09-10'] as const) {
    for (let i = 0; i < 5; i += 1) {
      for (let k = 0; k < 8; k += 1) {
        const skills: Array<[string]> = [['PostgreSQL']];
        if (k < goCount[month]) skills.push(['Go']);
        if (k < rustCount[month]) skills.push(['Rust']);
        await job({ co: i, first: month, skills });
      }
    }
  }
  // Sep-only company floods Kafka (source mix + burst) — must not create INCREASING on the intersection.
  for (let k = 0; k < 40; k += 1) await job({ co: 5, first: '2026-09-12', skills: [['Kafka']] });

  // Cold-start check: aggregate as of mid-August (only Jul complete) → INSUFFICIENT_DATA.
  const cold = await demand.aggregateCareer(backend.id, new Date('2026-08-15T12:00:00Z'));
  await trends.computeCareer(backend.id, new Date('2026-08-15T12:00:00Z'));
  const coldTrends = await prisma.skillTrend.findMany({
    where: { careerId: backend.id, periodType: 'MONTH', methodologyVersion: TREND_METHODOLOGY_VERSION },
  });
  check('cold start labels everything INSUFFICIENT_DATA', coldTrends.length > 0 && coldTrends.every((t) => t.label === 'INSUFFICIENT_DATA'), {
    n: coldTrends.length,
    snaps: cold,
  });

  // Full aggregate through early October so Jul–Sep are complete.
  await demand.aggregateCareer(backend.id, new Date('2026-10-05T12:00:00Z'));
  const tr = await trends.computeCareer(backend.id, new Date('2026-10-05T12:00:00Z'));
  check('trends written after 3 complete months', tr.trendsWritten > 0, tr);

  const sep = new Date('2026-09-01T00:00:00Z');
  const rows = await prisma.skillTrend.findMany({
    where: { careerId: backend.id, periodType: 'MONTH', periodStart: sep, laneKey: 'all', methodologyVersion: TREND_METHODOLOGY_VERSION },
  });
  const byName = Object.fromEntries(rows.map((r) => [r.skillName, r]));
  check('methodologyVersion and NEW_POSTINGS basis stored', rows.every((r) => r.methodologyVersion === TREND_METHODOLOGY_VERSION && r.basis === 'NEW_POSTINGS'));
  check('source-mix / Sep-only Kafka burst is not INCREASING', !byName.Kafka || byName.Kafka.label !== 'INCREASING', byName.Kafka?.label);
  check('stable PostgreSQL stays STABLE or INSUFFICIENT_DATA (not INCREASING)', !byName.PostgreSQL || byName.PostgreSQL.label === 'STABLE' || byName.PostgreSQL.label === 'INSUFFICIENT_DATA', byName.PostgreSQL?.label);
  check('steady Go growth over 3 periods is INCREASING', byName.Go?.label === 'INCREASING', byName.Go && { label: byName.Go.label, effectPp: byName.Go.effectPp, confirmed: byName.Go.confirmedSteps, adj: byName.Go.adjustedPValue });
  check('Rust with low base is EMERGING or INCREASING', byName.Rust?.label === 'EMERGING' || byName.Rust?.label === 'INCREASING', byName.Rust?.label);
  check('intersection panel excludes the Sep-only company', rows.every((r) => r.panelCompanies <= 5), rows.map((r) => r.panelCompanies));

  const view = await trends.list(backend.id, { periodType: 'MONTH' });
  check('admin trend view exposes coldStart=false and provenance', view.coldStart === false && view.trends.every((t) => t.n > 0 && t.panel.companies > 0 && !!t.period), {
    coldStart: view.coldStart,
    n: view.trends.length,
  });

  // Re-run is idempotent for the same methodology version.
  const before = await prisma.skillTrend.count({ where: { careerId: backend.id } });
  await trends.computeCareer(backend.id, new Date('2026-10-05T13:00:00Z'));
  check('recompute replaces rows for the same version (no duplicates)', (await prisma.skillTrend.count({ where: { careerId: backend.id } })) === before);

  await prisma.$disconnect();
  console.log(failures === 0 ? 'M10 INTEGRATION PASSED' : `M10 INTEGRATION FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
