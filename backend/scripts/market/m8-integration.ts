/**
 * M8 acceptance checks against a SCRATCH database (run via run-integration.ps1, never against dev).
 * Career classification: title patterns + skill overlap, lanes, stored confidence, LLM fallback only for ambiguous
 * jobs, precision on a (fixture) labelled sample, and low-confidence jobs excluded from demand counts.
 */
import { PrismaClient } from '../../src/prisma/client';
import { INTEL_DEFAULTS } from '../../src/intel-config/intel-config.defaults';
import { SkillCandidateService } from '../../src/market/candidates/skill-candidate.service';
import { CareerLlmClassifier, LLM_CONFIDENCE_CAP } from '../../src/market/classify/career-llm.service';
import { CAREER_CLASSIFIER_VERSION } from '../../src/market/classify/career-scorer';
import { ClassifyStage } from '../../src/market/classify/classify.stage';
import { SUGGESTED_PATTERNS } from '../../src/market/classify/title-classifier';
import type { RawJobPayload } from '../../src/market/connectors/source-connector';
import { ExtractStage } from '../../src/market/extract/extract.stage';
import { MarketLlmExtractor } from '../../src/market/extract/market-llm-extractor.service';
import { MarketFetchService } from '../../src/market/ingest/market-fetch.service';
import { DedupeStage } from '../../src/market/process/dedupe.stage';
import { MarketProcessService } from '../../src/market/process/market-process.service';
import type { MarketMessage } from '../../src/market/queue/market-queue.constants';
import { MarketRetentionService } from '../../src/market/retention/market-retention.service';
import { evaluateSample } from '../../src/market/slice/quality-gate';
import { MarketSliceService } from '../../src/market/slice/market-slice.service';
import { SkillResolverService } from '../../src/skill-intel/skill-resolver.service';

const DAY = 24 * 60 * 60 * 1000;
let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
}

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

/** SCRATCH DB TEST DATA ONLY: fixture postings with the career a human would assign (the "label"). */
const FIXTURES: Record<string, Array<{ id: string; title: string; text: string; label: string[] }>> = {
  one: [
    { id: '1a', title: 'Senior Backend Engineer (Go)', text: 'Requirements\n- Go and PostgreSQL\n- Docker\n- REST APIs', label: ['backend'] },
    { id: '1b', title: 'Software Engineer', text: 'Requirements\n- Go and PostgreSQL\n- Docker and Kubernetes', label: ['backend'] },
    { id: '1c', title: 'Frontend Engineer', text: 'Requirements\n- React and TypeScript\n- CSS', label: ['frontend'] },
    { id: '1d', title: 'Engineering Manager, Backend', text: 'Requirements\n- Go and PostgreSQL\n- Docker', label: [] },
    { id: '1e', title: 'Data Scientist', text: 'Requirements\n- Python and SQL', label: [] },
  ],
  two: [
    { id: '2a', title: 'Back-End Developer (Java)', text: 'Requirements\n- Java with Spring Boot and PostgreSQL\n- REST APIs', label: ['backend'] },
    { id: '2b', title: 'Full Stack Engineer', text: 'Requirements\n- React and TypeScript\n- PostgreSQL', label: ['backend', 'frontend'] },
    { id: '2c', title: 'UI Engineer', text: 'Requirements\n- React, CSS and TypeScript', label: ['frontend'] },
    { id: '2d', title: 'Site Reliability Engineer', text: 'Requirements\n- Kubernetes and Docker\n- Go', label: ['devops'] },
  ],
};

async function main() {
  if (!/ai_market_it/.test(process.env.DATABASE_URL ?? '')) throw new Error('Refusing to run outside the ai_market_it scratch database');
  const prisma = new PrismaClient();
  const boards = Object.fromEntries(Object.entries(FIXTURES).map(([k, v]) => [k, v.map((f) => posting(f.id, f.title, f.text))]));
  let current = 'one';
  const connector = { fetch: async () => ({ jobs: boards[current], fetchedUrl: 'fixture://', robots: 'ALLOWED' as const }) };
  let llmFallback = false;
  const config = {
    get: async (key: keyof typeof INTEL_DEFAULTS) => (key === 'classification' ? { ...INTEL_DEFAULTS.classification, llmFallback } : INTEL_DEFAULTS[key]),
  };
  const publisher = { enqueueFollowUp: async () => 'task' };
  const consumer = { register: () => undefined };
  const counts = new Map<string, number>();
  const redis = { incr: async (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1).get(k)!, expire: async () => undefined };
  const llmCalls: string[] = [];
  const llm = {
    isConfigured: () => true,
    chat: () => ({
      withStructuredOutput: () => ({
        invoke: async (msgs: Array<{ content: unknown }>) => {
          llmCalls.push(String(msgs[1].content).split('\n')[0]);
          return { careers: ['backend', 'not-offered'], confidence: 0.97 };
        },
      }),
    }),
  };

  const fetchService = new MarketFetchService(prisma as never, { get: () => connector } as never, {} as never, config as never, consumer as never, publisher as never);
  const pipeline = new MarketProcessService(prisma as never, consumer as never, publisher as never);
  const retention = new MarketRetentionService(prisma as never, config as never, consumer as never, publisher as never);
  const extractor = new MarketLlmExtractor({ isConfigured: () => false } as never, {} as never, config as never);
  new DedupeStage(prisma as never, config as never, pipeline).onModuleInit();
  new ExtractStage(prisma as never, config as never, new SkillResolverService(prisma as never), extractor, pipeline, retention, new SkillCandidateService(prisma as never)).onModuleInit();
  new ClassifyStage(prisma as never, pipeline, config as never, new CareerLlmClassifier(llm as never, redis as never, config as never)).onModuleInit();
  const slice = new MarketSliceService(prisma as never, config as never);

  const skill: Record<string, string> = {};
  for (const name of ['PostgreSQL', 'Go', 'Docker', 'Kubernetes', 'Java', 'Spring Boot', 'REST', 'React', 'TypeScript', 'CSS', 'Python', 'SQL']) {
    skill[name] = (await prisma.skill.create({ data: { name, category: 'Core' } })).id;
  }
  const lanes = {
    backend: [
      { id: 'go', label: 'Go', keywords: ['go', 'golang'], syllabusSlug: 'golang' },
      { id: 'java', label: 'Java', keywords: ['java', 'spring'], syllabusSlug: 'java' },
    ],
    frontend: [{ id: 'react', label: 'React', keywords: ['react'], syllabusSlug: 'react' }],
  };
  const requires: Record<string, string[]> = {
    backend: ['Go', 'PostgreSQL', 'Docker', 'REST', 'Java', 'Spring Boot'],
    frontend: ['React', 'TypeScript', 'CSS'],
    devops: ['Docker', 'Kubernetes'],
  };
  const careers: Record<string, string> = {};
  for (const slug of ['backend', 'frontend', 'devops'] as const) {
    const c = await prisma.career.create({
      data: {
        slug,
        title: `${slug} career`,
        overview: 'fixture',
        marketExpectations: 'fixture',
        entryLevelExpectations: 'fixture',
        stackLanes: slug === 'devops' ? undefined : lanes[slug],
        requirements: { create: requires[slug].map((n) => ({ skillId: skill[n] })) },
      },
    });
    careers[slug] = c.id;
    await prisma.marketCareerProfile.create({ data: { careerId: c.id, ...SUGGESTED_PATTERNS[slug] } });
  }

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
  const runAll = async () => {
    await pipeline.processBatch(s1.id);
    await pipeline.processBatch(s2.id);
  };
  await runAll();
  check('all rows reach DONE', (await prisma.marketRawJob.count({ where: { processingStatus: 'DONE' } })) === 9);

  const minConf = INTEL_DEFAULTS.demand.minClassificationConfidence;
  const load = () => prisma.marketJob.findMany({ include: { careers: { include: { career: true } } } });
  let jobs = await load();
  const job = (title: string) => jobs.find((j) => j.title === title)!;
  const confident = (title: string) =>
    [...new Set(job(title).careers.filter((c) => c.laneKey === 'all' && c.confidence >= minConf).map((c) => c.career.slug))].sort();
  const lanesOf = (title: string, slug: string) =>
    job(title).careers.filter((c) => c.career.slug === slug && c.laneKey !== 'all').map((c) => c.laneKey).sort();

  const all = Object.values(FIXTURES).flat();
  const metrics = evaluateSample(all.map((f) => ({ label: { careers: f.label, skills: [] }, predicted: { careers: confident(f.title), skills: [] } })));
  check('classification precision >= 0.90 on the labelled sample', (metrics.classification.precision ?? 0) >= 0.9, metrics.classification);
  check('every row stores confidence, method and classifierVersion', jobs.every((j) => j.careers.every((c) => c.confidence > 0 && !!c.method && c.classifierVersion === CAREER_CLASSIFIER_VERSION)));
  check('title + skill overlap beats title alone', job('Senior Backend Engineer (Go)').careers.find((c) => c.laneKey === 'all')!.confidence > INTEL_DEFAULTS.classification.titleWeight);
  check('lanes come from whole-word keywords', lanesOf('Senior Backend Engineer (Go)', 'backend').join() === 'go' && lanesOf('Back-End Developer (Java)', 'backend').join() === 'java' && lanesOf('Frontend Engineer', 'frontend').join() === 'react');
  const fs = job('Full Stack Engineer').careers.filter((c) => c.laneKey === 'all');
  check('full stack: both careers, primary is the stronger one', confident('Full Stack Engineer').join() === 'backend,frontend' && fs.filter((c) => c.isPrimary).map((c) => c.career.slug).join() === 'frontend', fs.map((c) => [c.career.slug, c.confidence]));
  check('excluded title has no rows even with matching skills', job('Engineering Manager, Backend').careers.length === 0 && job('Engineering Manager, Backend').classificationStatus === 'UNCLASSIFIED');

  const amb = job('Software Engineer');
  check(
    'ambiguous job: low-confidence SKILL_OVERLAP candidates stored, job UNCLASSIFIED, no lane rows',
    amb.classificationStatus === 'UNCLASSIFIED' &&
      amb.careers.some((c) => c.career.slug === 'backend') &&
      amb.careers.every((c) => c.method === 'SKILL_OVERLAP' && c.confidence < minConf && c.laneKey === 'all' && !c.isPrimary),
    amb.careers.map((c) => [c.career.slug, c.laneKey, c.confidence]),
  );
  check('LLM not called while classification.llmFallback is off', llmCalls.length === 0);

  const summary = await slice.summary();
  const backendCount = summary.careers.find((c) => c.slug === 'backend')?.jobCount;
  check('demand counts exclude jobs below the threshold', backendCount === 3, summary.careers.map((c) => [c.slug, c.jobCount]));
  const goLane = await slice.careerSkills(careers.backend, 50, 'go');
  check('lane slice counts only that lane', goLane.jobCount === 1 && goLane.lanes.map((l) => `${l.laneKey}:${l.jobCount}`).join() === 'go:1,java:1', { jobCount: goLane.jobCount, lanes: goLane.lanes });
  const pgKey = skill.PostgreSQL;
  const drill = await slice.skillJobs(careers.backend, pgKey);
  check('drill-down skips low-confidence jobs', drill.jobs.length === 3 && !drill.jobs.some((j) => j.title === 'Software Engineer'), drill.jobs.map((j) => j.title));

  const before = await prisma.marketJobCareer.count();
  await prisma.marketRawJob.updateMany({ where: { processingStatus: 'DONE' }, data: { processingStatus: 'EXTRACTED' } });
  await runAll();
  check('reclassification is idempotent', (await prisma.marketJobCareer.count()) === before);

  llmFallback = true;
  await prisma.marketRawJob.updateMany({ where: { processingStatus: 'DONE' }, data: { processingStatus: 'EXTRACTED' } });
  await runAll();
  jobs = await load();
  const llmRows = job('Software Engineer').careers;
  check('LLM asked only for the ambiguous job', llmCalls.length === 1 && llmCalls[0] === 'Title: Software Engineer', llmCalls);
  check('LLM picks only among candidates, confidence capped, lanes added', job('Software Engineer').classificationStatus === 'CLASSIFIED' && llmRows.every((r) => r.method === 'LLM' && r.career.slug === 'backend' && r.confidence === LLM_CONFIDENCE_CAP) && lanesOf('Software Engineer', 'backend').join() === 'go', llmRows.map((r) => [r.career.slug, r.laneKey, r.method, r.confidence]));
  check('confident rule-based jobs unchanged with fallback on', confident('Senior Backend Engineer (Go)').join() === 'backend' && job('Senior Backend Engineer (Go)').careers.every((c) => c.method === 'TITLE_PATTERN'));
  check('budget shared with extraction key', [...counts.keys()].every((k) => k.startsWith('market:llm:')) && [...counts.values()].reduce((a, b) => a + b, 0) === 1);

  await prisma.$disconnect();
  console.log(failures === 0 ? 'M8 INTEGRATION PASSED' : `M8 INTEGRATION FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
