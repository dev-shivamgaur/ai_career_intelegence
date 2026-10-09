/**
 * M5 acceptance checks against a SCRATCH database (run via run-integration.ps1, never against dev).
 * Every stored skill has a validated evidence span; the LLM budget is enforced; extractorVersion is recorded;
 * excerpts follow retention; purged text keeps its skills.
 */
import { PrismaClient } from '../../src/prisma/client';
import { INTEL_DEFAULTS } from '../../src/intel-config/intel-config.defaults';
import type { RawJobPayload } from '../../src/market/connectors/source-connector';
import { SkillCandidateService } from '../../src/market/candidates/skill-candidate.service';
import { ExtractStage } from '../../src/market/extract/extract.stage';
import { MarketLlmExtractor } from '../../src/market/extract/market-llm-extractor.service';
import { MarketFetchService } from '../../src/market/ingest/market-fetch.service';
import { DedupeStage } from '../../src/market/process/dedupe.stage';
import { MarketProcessService } from '../../src/market/process/market-process.service';
import type { MarketMessage } from '../../src/market/queue/market-queue.constants';
import { MarketRetentionService } from '../../src/market/retention/market-retention.service';
import { SkillResolverService } from '../../src/skill-intel/skill-resolver.service';

const DAY = 24 * 60 * 60 * 1000;
let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
}

const BACKEND = [
  'About the role',
  'You will build payment services in Go and Node.js and own them end to end.',
  'Requirements',
  '- 4+ years of experience with PostgreSQL',
  '- Strong TypeScript and REST API design',
  '- Docker and Kubernetes',
  'Nice to have',
  '- Kafka or RabbitMQ',
  '- Experience with feature stores is a plus',
].join('\n');
const FRONTEND = [
  'What you will do',
  'Ship accessible interfaces for our dashboard.',
  'Qualifications',
  '- React and TypeScript',
  '- CSS and testing with Jest',
].join('\n');

function posting(id: string, title: string, description: string): RawJobPayload {
  return {
    externalId: id,
    title,
    location: 'Remote - US',
    descriptionText: description,
    url: `https://example.invalid/${id}`,
    postedAt: new Date(Date.now() - 3 * DAY),
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
  const board = [posting('a', 'Senior Backend Engineer', BACKEND), posting('b', 'Frontend Engineer', FRONTEND)];
  const connector = { fetch: async () => ({ jobs: board, fetchedUrl: 'fixture://', robots: 'ALLOWED' as const }) };
  const extraction = { ...INTEL_DEFAULTS.extraction, llmDailyLimit: 1 };
  const config = { get: async (key: keyof typeof INTEL_DEFAULTS) => (key === 'extraction' ? extraction : INTEL_DEFAULTS[key]) };
  const publisher = { enqueueFollowUp: async () => 'task' };
  const consumer = { register: () => undefined };

  const counts = new Map<string, number>();
  const redis = {
    incr: async (k: string) => {
      counts.set(k, (counts.get(k) ?? 0) + 1);
      return counts.get(k)!;
    },
    expire: async () => undefined,
  };
  const llmCalls: string[] = [];
  const llm = {
    isConfigured: () => true,
    chat: () => ({
      withStructuredOutput: () => ({
        invoke: async (messages: Array<{ content: unknown }>) => {
          llmCalls.push(String(messages[1].content).slice(0, 20));
          return {
            skills: [
              { name: 'Feature Stores', level: 'PREFERRED', evidence: 'experience with feature  stores', confidence: 0.9 },
              { name: 'Snowflake', level: 'REQUIRED', evidence: 'Snowflake data warehouse', confidence: 0.95 },
              { name: 'PostgreSQL', level: 'REQUIRED', evidence: '4+ years of experience with PostgreSQL', confidence: 0.9 },
            ],
          };
        },
      }),
    }),
  };

  const fetchService = new MarketFetchService(prisma as never, { get: () => connector } as never, {} as never, config as never, consumer as never, publisher as never);
  const pipeline = new MarketProcessService(prisma as never, consumer as never, publisher as never);
  const retention = new MarketRetentionService(prisma as never, config as never, consumer as never, publisher as never);
  const resolver = new SkillResolverService(prisma as never);
  const extractor = new MarketLlmExtractor(llm as never, redis as never, config as never);
  new DedupeStage(prisma as never, config as never, pipeline).onModuleInit();
  new ExtractStage(prisma as never, config as never, resolver, extractor, pipeline, retention, new SkillCandidateService(prisma as never)).onModuleInit();
  check('pipeline stages chain dedupe -> extract', pipeline.stageNames().join(',') === 'dedupe:PENDING->DEDUPED,extract:DEDUPED->EXTRACTED', pipeline.stageNames());

  for (const name of ['PostgreSQL', 'TypeScript', 'Kafka', 'React']) {
    await prisma.skill.create({ data: { name, category: 'Core' } });
  }
  const company = await prisma.company.create({ data: { name: 'Fixture Co', slug: 'fixture-co' } });
  const source = await prisma.marketSource.create({
    data: {
      companyId: company.id,
      type: 'GREENHOUSE',
      boardToken: 'fx',
      termsUrl: 'https://example.invalid/terms',
      termsSummary: 'SCRATCH DB TEST DATA ONLY - not a real terms review',
      termsReviewedAt: new Date(),
      termsReviewedBy: 'integration-test',
      allowedUses: ['ANALYTICS_AGGREGATE'],
      termsReviewDueAt: new Date(Date.now() + 30 * DAY),
      enabled: true,
    },
  });
  const msg: MarketMessage = { taskId: 't', runId: 'r', queue: 'market.fetch', attempt: 1, payload: { sourceId: source.id } };
  await fetchService.handle(msg);

  process.env.MARKET_LLM_EXTRACTION = 'true';
  const run1 = await pipeline.processBatch(source.id);
  delete process.env.MARKET_LLM_EXTRACTION;
  check('both rows reach EXTRACTED', run1.counters.processed === 2 && run1.counters.extract === 2 && run1.remaining === 0, run1.counters);
  check('LLM called once: daily limit of 1 enforced', llmCalls.length === 1 && run1.counters.llmCalls === 1 && run1.counters.llmSkippedBUDGET === 1, {
    llmCalls,
    counters: run1.counters,
  });

  const raws = await prisma.marketRawJob.findMany({ include: { skills: true }, orderBy: { externalId: 'asc' } });
  const versions = raws.map((r) => r.processorVersion).sort();
  check('extractorVersion recorded per row (one with LLM, one rules only)', JSON.stringify(versions) === JSON.stringify(['rules-1', 'rules-1+llm-1']), versions);
  check('skills carry the row extractor version', raws.every((r) => r.skills.every((s) => s.extractorVersion === r.processorVersion)));

  const all = raws.flatMap((r) => r.skills.map((s) => ({ ...s, text: r.rawDescription ?? '' })));
  const badSpan = all.filter(
    (s) => s.evidenceStart === null || s.evidenceEnd === null || s.evidenceEnd <= s.evidenceStart || !s.evidence || s.evidence.length > 200,
  );
  check('every stored skill has an evidence span and excerpt', all.length > 0 && badSpan.length === 0, badSpan.map((s) => s.rawName));
  const notInText = all.filter((s) => {
    const quoted = s.text.slice(s.evidenceStart!, s.evidenceEnd!).replace(/\s+/g, ' ').toLowerCase();
    return !s.evidence!.toLowerCase().includes(quoted) || !s.text.replace(/\s+/g, ' ').toLowerCase().includes(s.evidence!.toLowerCase());
  });
  check('evidence is a verbatim quote of the description', notInText.length === 0, notInText.map((s) => s.rawName));

  const backend = raws.find((r) => r.externalId === 'a')!.skills;
  const by = new Map(backend.map((s) => [s.normalizedName, s]));
  check('hallucinated LLM skill (evidence not in text) dropped', !by.has('snowflake'));
  const fs = by.get('featurestores');
  check('LLM-only skill stored as LLM, capped, RECOMMENDED', fs?.method === 'LLM' && fs.confidence <= 0.7 && fs.level === 'RECOMMENDED', fs);
  check('skill found by both passes is RULE_LLM', by.get('postgresql')?.method === 'RULE_LLM' && by.get('postgresql')!.yearsRequired === 4, by.get('postgresql'));
  check('section levels: Kafka RECOMMENDED, Docker REQUIRED, Go NICE_TO_HAVE', by.get('kafka')?.level === 'RECOMMENDED' && by.get('docker')?.level === 'REQUIRED' && by.get('go')?.level === 'NICE_TO_HAVE', [
    by.get('kafka')?.level,
    by.get('docker')?.level,
    by.get('go')?.level,
  ]);
  check('seeded skills resolved, others kept unresolved', !!by.get('postgresql')?.skillId && !!by.get('kafka')?.skillId && by.get('docker')?.skillId === null, {
    pg: by.get('postgresql')?.resolveMethod,
    docker: by.get('docker')?.resolveMethod,
  });

  const before = await prisma.marketJobSkill.count();
  await prisma.marketRawJob.updateMany({ data: { processingStatus: 'PENDING' } });
  const run2 = await pipeline.processBatch(source.id);
  check('re-extraction replaces rows (no duplicates), rules-only now', run2.counters.processed === 2 && (await prisma.marketJobSkill.count()) === before - 1, {
    before,
    after: await prisma.marketJobSkill.count(),
  });

  await prisma.marketSource.update({ where: { id: source.id }, data: { evidenceExcerptMaxChars: 20 } });
  const trimmed = await retention.purgeSource(source.id, 'policy');
  const longest = await prisma.$queryRaw<Array<{ max: number | null }>>`SELECT MAX(LENGTH("evidence"))::int AS max FROM "market_job_skill"`;
  check('stricter excerpt limit trims stored excerpts', trimmed.excerptsCleared > 0 && (longest[0].max ?? 0) <= 20, { trimmed, longest: longest[0].max });

  const full = await retention.purgeSource(source.id, 'full');
  const withEvidence = await prisma.marketJobSkill.count({ where: { evidence: { not: null } } });
  const kept = await prisma.marketJobSkill.count();
  check('full purge clears excerpts but keeps structured skills', full.descriptionsPurged === 2 && withEvidence === 0 && kept === before - 1, { full, withEvidence, kept });

  await prisma.marketRawJob.updateMany({ data: { processingStatus: 'PENDING' } });
  const run3 = await pipeline.processBatch(source.id);
  check('purged rows reprocess without losing skills', run3.counters.processed === 2 && (await prisma.marketJobSkill.count()) === kept, run3.counters);

  await prisma.$disconnect();
  console.log(failures === 0 ? 'M5 INTEGRATION PASSED' : `M5 INTEGRATION FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
