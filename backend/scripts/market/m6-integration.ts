/**
 * M6 acceptance checks against a SCRATCH database (run via run-integration.ps1, never against dev).
 * End to end: fetch -> dedupe -> extract -> classify; SkillCandidates; slice report counts with no percentages;
 * drill-down to evidence; reclassification after a pattern change; admin assignments survive.
 */
import { PrismaClient } from '../../src/prisma/client';
import { INTEL_DEFAULTS } from '../../src/intel-config/intel-config.defaults';
import { SkillCandidateService } from '../../src/market/candidates/skill-candidate.service';
import { ClassifyStage } from '../../src/market/classify/classify.stage';
import type { RawJobPayload } from '../../src/market/connectors/source-connector';
import { ExtractStage } from '../../src/market/extract/extract.stage';
import { MarketLlmExtractor } from '../../src/market/extract/market-llm-extractor.service';
import { MarketFetchService } from '../../src/market/ingest/market-fetch.service';
import { DedupeStage } from '../../src/market/process/dedupe.stage';
import { MarketProcessService } from '../../src/market/process/market-process.service';
import type { MarketMessage } from '../../src/market/queue/market-queue.constants';
import { MarketRetentionService } from '../../src/market/retention/market-retention.service';
import { MarketSliceService } from '../../src/market/slice/market-slice.service';
import { SkillResolverService } from '../../src/skill-intel/skill-resolver.service';

const DAY = 24 * 60 * 60 * 1000;
let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
}

const BACKEND = 'Requirements\n- 3+ years of experience with Go and PostgreSQL\n- Docker, Kubernetes\nNice to have\n- Kafka and Temporalio workflows';
const BACKEND_B = 'Requirements\n- Java with Spring Boot and PostgreSQL\n- REST APIs\nNice to have\n- Temporalio';
const FRONTEND = 'Requirements\n- React and TypeScript\n- CSS\nNice to have\n- Storybook';
const DATA = 'Requirements\n- Python and SQL\n- Airflow';

function posting(id: string, title: string, description: string): RawJobPayload {
  return {
    externalId: id,
    title,
    location: 'Remote - US',
    descriptionText: description,
    url: `https://example.invalid/${id}`,
    postedAt: new Date(Date.now() - 2 * DAY),
    sourceUpdatedAt: null,
    department: null,
    employmentType: 'Full-time',
    workplaceType: null,
    raw: { id },
  };
}

async function main() {
  if (!/ai_market_it/.test(process.env.DATABASE_URL ?? '')) throw new Error('Refusing to run outside the ai_market_it scratch database');
  const prisma = new PrismaClient();
  const boards: Record<string, RawJobPayload[]> = {
    one: [posting('1a', 'Senior Backend Engineer', BACKEND), posting('1b', 'Frontend Developer', FRONTEND), posting('1c', 'Data Scientist', DATA)],
    two: [posting('2a', 'Back-End Developer (Java)', BACKEND_B), posting('2b', 'Full Stack Engineer', `${FRONTEND}\n- PostgreSQL`)],
  };
  let current = 'one';
  const connector = { fetch: async () => ({ jobs: boards[current], fetchedUrl: 'fixture://', robots: 'ALLOWED' as const }) };
  const config = { get: async (key: keyof typeof INTEL_DEFAULTS) => INTEL_DEFAULTS[key] };
  const publisher = { enqueueFollowUp: async () => 'task' };
  const consumer = { register: () => undefined };
  const llm = { isConfigured: () => false };

  const fetchService = new MarketFetchService(prisma as never, { get: () => connector } as never, {} as never, config as never, consumer as never, publisher as never);
  const pipeline = new MarketProcessService(prisma as never, consumer as never, publisher as never);
  const retention = new MarketRetentionService(prisma as never, config as never, consumer as never, publisher as never);
  const candidates = new SkillCandidateService(prisma as never);
  const extractor = new MarketLlmExtractor(llm as never, {} as never, config as never);
  new DedupeStage(prisma as never, config as never, pipeline).onModuleInit();
  new ExtractStage(prisma as never, config as never, new SkillResolverService(prisma as never), extractor, pipeline, retention, candidates).onModuleInit();
  new ClassifyStage(prisma as never, pipeline).onModuleInit();
  const slice = new MarketSliceService(prisma as never, config as never);
  check('stages chain dedupe -> extract -> classify', pipeline.stageNames().length === 3, pipeline.stageNames());

  for (const name of ['PostgreSQL', 'Go', 'Docker', 'Kubernetes', 'Kafka', 'Java', 'Spring Boot', 'REST', 'React', 'TypeScript', 'CSS', 'Python', 'SQL']) {
    await prisma.skill.create({ data: { name, category: 'Core' } });
  }
  const career = (slug: string, title: string) =>
    prisma.career.create({ data: { slug, title, overview: 'fixture', marketExpectations: 'fixture', entryLevelExpectations: 'fixture' } });
  const backend = await career('backend', 'Backend Developer');
  const frontend = await career('frontend', 'Frontend Developer');
  await prisma.marketCareerProfile.create({ data: { careerId: backend.id, titlePatterns: ['backend', 'fullstack'], excludePatterns: ['manager'] } });
  await prisma.marketCareerProfile.create({ data: { careerId: frontend.id, titlePatterns: ['frontend', 'fullstack'], excludePatterns: ['manager'] } });

  const terms = {
    termsUrl: 'https://example.invalid/terms',
    termsSummary: 'SCRATCH DB TEST DATA ONLY - not a real terms review',
    termsReviewedAt: new Date(),
    termsReviewedBy: 'integration-test',
    allowedUses: ['ANALYTICS_AGGREGATE'],
    termsReviewDueAt: new Date(Date.now() + 30 * DAY),
    enabled: true,
  };
  const c1 = await prisma.company.create({ data: { name: 'One Co', slug: 'one-co' } });
  const c2 = await prisma.company.create({ data: { name: 'Two Co', slug: 'two-co' } });
  const s1 = await prisma.marketSource.create({ data: { companyId: c1.id, type: 'GREENHOUSE', boardToken: 'one', ...terms } });
  const s2 = await prisma.marketSource.create({ data: { companyId: c2.id, type: 'LEVER', boardToken: 'two', ...terms } });
  const msg = (sourceId: string): MarketMessage => ({ taskId: 't', runId: 'r', queue: 'market.fetch', attempt: 1, payload: { sourceId } });
  current = 'one';
  await fetchService.handle(msg(s1.id));
  current = 'two';
  await fetchService.handle(msg(s2.id));
  const r1 = await pipeline.processBatch(s1.id);
  const r2 = await pipeline.processBatch(s2.id);
  check('all rows reach DONE', (await prisma.marketRawJob.count({ where: { processingStatus: 'DONE' } })) === 5, { r1: r1.counters, r2: r2.counters });

  const jobs = await prisma.marketJob.findMany({ include: { careers: { include: { career: true } } } });
  const careersOf = (title: string) => jobs.find((j) => j.title === title)!.careers.map((c) => c.career.slug).sort();
  check('backend titles -> backend', careersOf('Senior Backend Engineer').join() === 'backend' && careersOf('Back-End Developer (Java)').join() === 'backend');
  check('frontend title -> frontend', careersOf('Frontend Developer').join() === 'frontend');
  check('full stack -> both careers, one primary', careersOf('Full Stack Engineer').join() === 'backend,frontend' && jobs.find((j) => j.title === 'Full Stack Engineer')!.careers.filter((c) => c.isPrimary).length === 1);
  const ds = jobs.find((j) => j.title === 'Data Scientist')!;
  check('non-matching title is UNCLASSIFIED, nothing guessed', ds.classificationStatus === 'UNCLASSIFIED' && ds.careers.length === 0);

  const temporal = await prisma.skillCandidate.findMany();
  const names = temporal.map((c) => `${c.normalizedName}:${c.jobCount}/${c.companyCount}`).sort();
  check('unresolved names become PENDING SkillCandidates with job/company counts', temporal.every((c) => c.status === 'PENDING') && names.includes('apacheairflow:1/1') && names.includes('storybook:2/2'), names);

  const summary = await slice.summary();
  const skillsBackend = await slice.careerSkills(backend.id);
  const pg = skillsBackend.skills.find((s) => s.name === 'PostgreSQL');
  check('slice summary: ACTIVE_STOCK basis, raw counts', summary.basis === 'ACTIVE_STOCK' && summary.openJobs === 5 && summary.classification.unclassified === 1, {
    open: summary.openJobs,
    cls: summary.classification,
  });
  check('backend top skills counted per job across companies', skillsBackend.jobCount === 3 && pg?.jobCount === 3 && pg.companyCount === 2 && pg.requiredCount === 2, pg);
  const serialized = JSON.stringify([summary.careers, skillsBackend]);
  check('no percentages or trends published', !/pct|percent|share|trend/i.test(serialized));
  check('unresolved skill rate reported', summary.quality.unresolvedSkillRate !== null && summary.quality.unresolvedSkillRows > 0, summary.quality);

  const drill = await slice.skillJobs(backend.id, pg!.key);
  const ev = drill.jobs.flatMap((j) => j.skills);
  check('drill-down: skill -> jobs -> source -> evidence span', drill.jobs.length === 3 && ev.every((s) => !!s.evidence && s.evidenceStart !== null && !!s.rawJob.source.type), {
    jobs: drill.jobs.length,
    sample: ev[0],
  });
  const temporalKey = skillsBackend.skills.find((s) => !s.resolved)?.key;
  check('unresolved skills drill down by name key', !!temporalKey && (await slice.skillJobs(backend.id, temporalKey!)).jobs.length > 0, temporalKey);

  const candidateCounts = (await prisma.skillCandidate.findMany({ orderBy: { normalizedName: 'asc' } })).map((c) => `${c.normalizedName}:${c.jobCount}`);
  await prisma.marketRawJob.updateMany({ data: { processingStatus: 'PENDING' } });
  await pipeline.processBatch(s1.id);
  await pipeline.processBatch(s2.id);
  const again = (await prisma.skillCandidate.findMany({ orderBy: { normalizedName: 'asc' } })).map((c) => `${c.normalizedName}:${c.jobCount}`);
  check('reprocessing does not double count candidates', JSON.stringify(candidateCounts) === JSON.stringify(again), again);

  const fullStack = jobs.find((j) => j.title === 'Full Stack Engineer')!;
  await prisma.marketJobCareer.deleteMany({ where: { marketJobId: ds.id } });
  await prisma.marketJobCareer.create({
    data: { marketJobId: ds.id, careerId: backend.id, confidence: 1, method: 'ADMIN', isPrimary: true, classifierVersion: 'admin' },
  });
  await prisma.marketCareerProfile.update({ where: { careerId: backend.id }, data: { titlePatterns: ['backend'] } });
  await prisma.marketRawJob.updateMany({ where: { processingStatus: 'DONE' }, data: { processingStatus: 'EXTRACTED' } });
  await pipeline.processBatch(s1.id);
  await pipeline.processBatch(s2.id);
  const fsCareers = await prisma.marketJobCareer.findMany({ where: { marketJobId: fullStack.id }, include: { career: true } });
  check('pattern change + reclassify drops full stack from backend', fsCareers.map((c) => c.career.slug).join() === 'frontend', fsCareers.map((c) => c.career.slug));
  const dsAfter = await prisma.marketJob.findUniqueOrThrow({ where: { id: ds.id }, include: { careers: true } });
  check('admin assignment survives reclassification', dsAfter.classificationStatus === 'CLASSIFIED' && dsAfter.careers.length === 1 && dsAfter.careers[0].method === 'ADMIN');

  await prisma.$disconnect();
  console.log(failures === 0 ? 'M6 INTEGRATION PASSED' : `M6 INTEGRATION FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
