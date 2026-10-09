/**
 * M4 acceptance checks against a SCRATCH database (run via run-integration.ps1, never against dev).
 * Two boards of one company: the same vacancy on both must merge; a same-title but different vacancy must not.
 */
import { PrismaClient } from '../../src/prisma/client';
import { INTEL_DEFAULTS } from '../../src/intel-config/intel-config.defaults';
import type { RawJobPayload } from '../../src/market/connectors/source-connector';
import { MarketFetchService } from '../../src/market/ingest/market-fetch.service';
import { DedupeStage } from '../../src/market/process/dedupe.stage';
import { MarketProcessService } from '../../src/market/process/market-process.service';
import type { MarketMessage } from '../../src/market/queue/market-queue.constants';

const DAY = 24 * 60 * 60 * 1000;
let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
}

const BACKEND =
  'We are hiring a backend engineer to design and build scalable APIs in Node.js and PostgreSQL. You will own services ' +
  'end to end, write tests, review code, and partner with product on the roadmap. Requirements: 3+ years of experience, ' +
  'strong TypeScript, SQL, REST, Docker, AWS and CI/CD pipelines. Nice to have: Kafka, Redis, Kubernetes.';
const BACKEND_OTHER =
  'The payments platform team needs a backend engineer to run ledger reconciliation in Java and Spring Boot, ' +
  'own batch settlement jobs, and work with finance on audit controls. Requirements: 5+ years of experience with JVM services.';
const FRONTEND =
  'Build delightful interfaces with React and TypeScript. You will work on our design system, accessibility and performance. ' +
  'Requirements: 2+ years of experience with modern frontend tooling, CSS and testing.';

function posting(id: string, title: string, description: string, location = 'New York, NY'): RawJobPayload {
  return {
    externalId: id,
    title,
    location,
    descriptionText: description,
    url: `https://example.invalid/${id}`,
    postedAt: new Date(Date.now() - 5 * DAY),
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
    gh: [posting('gh-a', 'Senior Backend Engineer', BACKEND), posting('gh-b', 'Frontend Developer', FRONTEND)],
    lv: [
      posting('lv-a', 'Backend Engineer (Senior)', `${BACKEND} Apply through our careers page.`, 'New York, NY, United States'),
      posting('lv-c', 'Backend Engineer', BACKEND_OTHER),
      posting('lv-d', 'Backend Engineer', BACKEND, 'Bengaluru, India'),
    ],
  };
  let current = 'gh';
  const connector = { fetch: async () => ({ jobs: boards[current], fetchedUrl: 'fixture://', robots: 'ALLOWED' as const }) };
  const config = { get: async (key: keyof typeof INTEL_DEFAULTS) => INTEL_DEFAULTS[key] };
  const publisher = { enqueueFollowUp: async () => 'task' };
  const consumer = { register: () => undefined };
  const fetchService = new MarketFetchService(prisma as never, { get: () => connector } as never, {} as never, config as never, consumer as never, publisher as never);
  const pipeline = new MarketProcessService(prisma as never, consumer as never, publisher as never);
  new DedupeStage(prisma as never, config as never, pipeline).onModuleInit();

  const company = await prisma.company.create({ data: { name: 'Fixture Co', slug: 'fixture-co' } });
  const terms = {
    termsUrl: 'https://example.invalid/terms',
    termsSummary: 'SCRATCH DB TEST DATA ONLY - not a real terms review',
    termsReviewedAt: new Date(),
    termsReviewedBy: 'integration-test',
    allowedUses: ['ANALYTICS_AGGREGATE'],
    termsReviewDueAt: new Date(Date.now() + 30 * DAY),
    enabled: true,
  };
  const gh = await prisma.marketSource.create({ data: { companyId: company.id, type: 'GREENHOUSE', boardToken: 'fx', ...terms } });
  const lv = await prisma.marketSource.create({ data: { companyId: company.id, type: 'LEVER', boardToken: 'fx', ...terms } });
  const msg = (sourceId: string): MarketMessage => ({ taskId: 't', runId: 'r', queue: 'market.fetch', attempt: 1, payload: { sourceId } });

  current = 'gh';
  await fetchService.handle(msg(gh.id));
  current = 'lv';
  await fetchService.handle(msg(lv.id));
  const p1 = await pipeline.processBatch(gh.id);
  const p2 = await pipeline.processBatch(lv.id);
  check('every raw row processed to DEDUPED', p1.counters.processed === 2 && p2.counters.processed === 3, { p1: p1.counters, p2: p2.counters });

  const jobs = await prisma.marketJob.findMany({ include: { rawJobs: { select: { externalId: true } } } });
  const linkOf = (ext: string) => jobs.find((j) => j.rawJobs.some((r) => r.externalId === ext))?.id;
  check('4 vacancies from 5 postings', jobs.length === 4, jobs.map((j) => [j.normalizedTitle, j.rawJobs.map((r) => r.externalId)]));
  check('same vacancy on two boards merged', linkOf('gh-a') === linkOf('lv-a') && !!linkOf('gh-a'));
  check('same title, different description: not merged', linkOf('lv-c') !== linkOf('gh-a'));
  check('same text, other country: not merged', linkOf('lv-d') !== linkOf('gh-a'));
  const merged = jobs.find((j) => j.id === linkOf('gh-a'))!;
  check('merged job counts both sources', merged.sourceCount === 2, merged.sourceCount);
  check('normalized fields stored', merged.normalizedTitle === 'backend engineer' && merged.seniority === 'SENIOR' && merged.countries.includes('US') && merged.experienceMinYears === 3, {
    t: merged.normalizedTitle,
    s: merged.seniority,
    c: merged.countries,
    e: merged.experienceMinYears,
  });

  const before = (await prisma.marketRawJob.findMany({ orderBy: { externalId: 'asc' }, select: { externalId: true, marketJobId: true } })).map((r) => `${r.externalId}:${r.marketJobId}`);
  await prisma.marketRawJob.updateMany({ data: { processingStatus: 'PENDING' } });
  await pipeline.processBatch(gh.id);
  await pipeline.processBatch(lv.id);
  const after = (await prisma.marketRawJob.findMany({ orderBy: { externalId: 'asc' }, select: { externalId: true, marketJobId: true } })).map((r) => `${r.externalId}:${r.marketJobId}`);
  check('reprocessing is idempotent (same links, same job count)', JSON.stringify(before) === JSON.stringify(after) && (await prisma.marketJob.count()) === 4);

  boards.gh = boards.gh.filter((j) => j.externalId !== 'gh-a');
  current = 'gh';
  await fetchService.handle(msg(gh.id));
  let a = await prisma.marketJob.findUniqueOrThrow({ where: { id: merged.id } });
  check('vacancy stays OPEN while another board lists it', a.status === 'OPEN');
  boards.lv = boards.lv.filter((j) => j.externalId !== 'lv-a');
  current = 'lv';
  await fetchService.handle(msg(lv.id));
  a = await prisma.marketJob.findUniqueOrThrow({ where: { id: merged.id } });
  check('vacancy CLOSED once no board lists it', a.status === 'CLOSED' && !!a.closedAt);

  await prisma.$disconnect();
  console.log(failures === 0 ? 'M4 INTEGRATION PASSED' : `M4 INTEGRATION FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
