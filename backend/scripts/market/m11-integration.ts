/**
 * M11 acceptance against a SCRATCH database (run via run-integration.ps1).
 * Roadmap vs market sets, promote writes source=ADMIN, and nothing else creates a requirement.
 */
import { PrismaClient } from '../../src/prisma/client';
import { MarketCompareService } from '../../src/market/compare/market-compare.service';
import { MarketLearnerController } from '../../src/market/compare/market-compare.controller';

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
}
const names = (rows: Array<{ name: string }>) => rows.map((r) => r.name).sort();

async function main() {
  if (!/ai_market_it/.test(process.env.DATABASE_URL ?? '')) throw new Error('Refusing to run outside the ai_market_it scratch database');
  const prisma = new PrismaClient();
  const redis = { get: async () => null, set: async () => undefined, incr: async () => 1 };
  const compare = new MarketCompareService(prisma as never, redis as never, { registerAfterCareer: () => undefined } as never);
  const learner = new MarketLearnerController(compare, {} as never, {} as never);

  const skill: Record<string, string> = {};
  for (const name of ['SQL', 'React', 'CSS', 'Git', 'Kafka']) skill[name] = (await prisma.skill.create({ data: { name, category: 'Core' } })).id;
  const career = await prisma.career.create({
    data: { slug: 'backend', title: 'Backend', overview: 'fixture', marketExpectations: 'fixture', entryLevelExpectations: 'fixture' },
  });
  const req = (name: string, importance: 'HIGH' | 'MEDIUM' | 'LOW', type: 'REQUIRED' | 'RECOMMENDED' | 'NICE_TO_HAVE') =>
    prisma.careerSkillRequirement.create({
      data: { careerId: career.id, skillId: skill[name], importance, type, source: 'ROADMAP' },
    });
  await req('SQL', 'HIGH', 'REQUIRED');
  await req('React', 'HIGH', 'REQUIRED');
  await req('CSS', 'LOW', 'NICE_TO_HAVE');
  await req('Git', 'MEDIUM', 'RECOMMENDED');

  const start = new Date('2026-09-01T00:00:00Z');
  const end = new Date('2026-10-01T00:00:00Z');
  await prisma.marketCareerSnapshot.create({
    data: {
      periodType: 'MONTH',
      periodStart: start,
      periodEnd: end,
      basis: 'ACTIVE_STOCK',
      careerId: career.id,
      laneKey: 'all',
      methodologyVersion: 'demand-1',
      isComplete: true,
      totalJobs: 40,
      cappedTotal: 40,
      companyCount: 4,
      capJobs: 8,
      panelSources: 4,
      panelCompanies: 4,
      params: {},
    },
  });
  const snap = (name: string, demandPct: number) =>
    prisma.marketSkillSnapshot.create({
      data: {
        periodType: 'MONTH',
        periodStart: start,
        periodEnd: end,
        basis: 'ACTIVE_STOCK',
        careerId: career.id,
        laneKey: 'all',
        skillId: skill[name],
        skillName: name,
        methodologyVersion: 'demand-1',
        isComplete: true,
        jobCount: Math.round(demandPct * 40),
        requiredCount: 1,
        preferredCount: 0,
        niceCount: 0,
        companyCount: 4,
        cappedJobCount: demandPct * 40,
        totalJobs: 40,
        cappedTotal: 40,
        demandPct,
        wilsonLower: Math.max(0, demandPct - 0.05),
        wilsonUpper: Math.min(1, demandPct + 0.05),
        panelCompanies: 4,
      },
    });
  await snap('SQL', 0.4);
  await snap('React', 0.08);
  await snap('CSS', 0.3);
  await snap('Kafka', 0.25);
  await prisma.skillTrend.createMany({
    data: ['SQL', 'Kafka'].map((name) => ({
      periodType: 'MONTH' as const,
      periodStart: start,
      periodEnd: end,
      priorPeriodStart: new Date('2026-08-01T00:00:00Z'),
      priorPeriodEnd: start,
      careerId: career.id,
      laneKey: 'all',
      skillId: skill[name],
      skillName: name,
      methodologyVersion: 'trend-1',
      basis: 'NEW_POSTINGS' as const,
      label: name === 'Kafka' ? ('EMERGING' as const) : ('STABLE' as const),
      panelCompanies: 4,
      panelSources: 4,
      jobCount: 10,
      priorJobCount: 4,
      totalJobs: 40,
      priorTotalJobs: 40,
      share: 0.25,
      priorShare: 0.1,
      effectPp: 0.15,
      companies: 4,
      priorCompanies: 3,
      params: {},
    })),
  });

  const before = await prisma.careerSkillRequirement.count();
  const view = await compare.compare(career.id, 'all');
  check('overlap is SQL, React and CSS', names(view.sets.overlap).join() === 'CSS,React,SQL', names(view.sets.overlap));
  check('roadmap-only is Git', names(view.sets.roadmapOnly).join() === 'Git');
  check('market-only is Kafka', names(view.sets.marketOnly).join() === 'Kafka');
  check('emerging is Kafka', names(view.sets.emerging).join() === 'Kafka');
  check('mismatch is required-but-rare React and optional-but-common CSS', names(view.sets.mismatch).join() === 'CSS,React', names(view.sets.mismatch));
  check('reading the comparison does not write requirements', (await prisma.careerSkillRequirement.count()) === before);

  delete process.env.MARKET_UI;
  let hidden = false;
  try {
    await learner.roadmap('backend');
  } catch (err) {
    hidden = (err as { response?: { error?: string }; getResponse?: () => { error?: string } }).getResponse?.().error === 'MARKET_UI_DISABLED' || String(err).includes('MARKET_UI_DISABLED');
    const body = (err as { getResponse?: () => { error?: string } }).getResponse?.();
    hidden = body?.error === 'MARKET_UI_DISABLED';
  }
  check('learner route is hidden while MARKET_UI is off', hidden);

  const promoted = await compare.promote(career.id, skill.Kafka, 'admin-user');
  const row = await prisma.careerSkillRequirement.findFirst({ where: { careerId: career.id, skillId: skill.Kafka } });
  check('promote creates source=ADMIN and leaves other requirements', promoted.created && row?.source === 'ADMIN' && (await prisma.careerSkillRequirement.count()) === before + 1, row?.source);
  const sql = await prisma.careerSkillRequirement.findFirst({ where: { careerId: career.id, skillId: skill.SQL } });
  check('roadmap rows keep their source', sql?.source === 'ROADMAP');

  await prisma.$disconnect();
  console.log(failures === 0 ? 'M11 INTEGRATION PASSED' : `M11 INTEGRATION FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
