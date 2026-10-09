/**
 * M7 acceptance checks against a SCRATCH database (run via run-integration.ps1, never against dev).
 * Market ingestion creates no Skill rows; approved aliases relink pending rows; rejected names disappear;
 * suggestions and auto-map follow the policy; the merge tool dry-runs by default and logs when executed.
 */
import { PrismaClient } from '../../src/prisma/client';
import { INTEL_DEFAULTS } from '../../src/intel-config/intel-config.defaults';
import { SkillCandidateService } from '../../src/market/candidates/skill-candidate.service';
import { SkillReviewService } from '../../src/market/candidates/skill-review.service';
import { SkillSuggestService } from '../../src/market/candidates/skill-suggest.service';
import { ClassifyStage } from '../../src/market/classify/classify.stage';
import type { RawJobPayload } from '../../src/market/connectors/source-connector';
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
async function rejects(fn: () => Promise<unknown>, code: string) {
  try {
    await fn();
    return false;
  } catch (err) {
    return JSON.stringify((err as { response?: unknown }).response ?? {}).includes(code);
  }
}

/** Letter-frequency vectors: similar spellings get similar vectors, which is all the fixture needs. */
function fakeVec(text: string): number[] {
  const v = new Array(26).fill(0);
  for (const ch of text.toLowerCase()) {
    const i = ch.charCodeAt(0) - 97;
    if (i >= 0 && i < 26) v[i] += 1;
  }
  return v;
}

const A = 'Requirements\n- PostgreSQL and Docker\n- Storybook for components\n- Agile delivery\nNice to have\n- Apache Airflow';
const B = 'Requirements\n- PostgreSQL\n- Storybook\n- Snowflake\n- Agile';

function posting(id: string, title: string, description: string): RawJobPayload {
  return {
    externalId: id,
    title,
    location: 'Remote - US',
    descriptionText: description,
    url: `https://example.invalid/${id}`,
    postedAt: new Date(Date.now() - DAY),
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
  const boards: Record<string, RawJobPayload[]> = { one: [posting('1a', 'Backend Engineer', A)], two: [posting('2a', 'Backend Engineer', B)] };
  let current = 'one';
  const connector = { fetch: async () => ({ jobs: boards[current], fetchedUrl: 'fixture://', robots: 'ALLOWED' as const }) };
  const resolverCfg = { ...INTEL_DEFAULTS.resolver, autoApprove: true, autoApproveMinJobs: 2, autoApproveMinCompanies: 2 };
  const config = { get: async (key: keyof typeof INTEL_DEFAULTS) => (key === 'resolver' ? resolverCfg : INTEL_DEFAULTS[key]) };
  const publisher = { enqueueFollowUp: async () => 'task' };
  const consumer = { register: () => undefined };
  const embeddings = {
    isConfigured: () => true,
    langchain: () => ({ embedDocuments: async (texts: string[]) => texts.map(fakeVec) }),
  };
  const llm = { isConfigured: () => false };

  const resolver = new SkillResolverService(prisma as never);
  const fetchService = new MarketFetchService(prisma as never, { get: () => connector } as never, {} as never, config as never, consumer as never, publisher as never);
  const pipeline = new MarketProcessService(prisma as never, consumer as never, publisher as never);
  const retention = new MarketRetentionService(prisma as never, config as never, consumer as never, publisher as never);
  const review = new SkillReviewService(prisma as never, resolver);
  const suggest = new SkillSuggestService(prisma as never, embeddings as never, llm as never, {} as never, config as never, review);
  new DedupeStage(prisma as never, config as never, pipeline).onModuleInit();
  new ExtractStage(prisma as never, config as never, resolver, new MarketLlmExtractor(llm as never, {} as never, config as never), pipeline, retention, new SkillCandidateService(prisma as never)).onModuleInit();
  new ClassifyStage(prisma as never, pipeline).onModuleInit();

  for (const name of ['PostgreSQL', 'Docker', 'Storybook JS', 'Snowflake Data Cloud', 'Node.js', 'Node JS']) {
    await prisma.skill.create({ data: { name, category: 'Core' } });
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
  const s2 = await prisma.marketSource.create({ data: { companyId: c2.id, type: 'ASHBY', boardToken: 'two', ...terms } });
  const msg = (sourceId: string): MarketMessage => ({ taskId: 't', runId: 'r', queue: 'market.fetch', attempt: 1, payload: { sourceId } });
  const processAll = async () => {
    await pipeline.processBatch(s1.id);
    await pipeline.processBatch(s2.id);
  };

  const skillsBefore = await prisma.skill.count();
  current = 'one';
  await fetchService.handle(msg(s1.id));
  current = 'two';
  await fetchService.handle(msg(s2.id));
  await processAll();
  check('market ingestion creates no Skill rows', (await prisma.skill.count()) === skillsBefore);
  const cands = new Map((await prisma.skillCandidate.findMany()).map((c) => [c.normalizedName, c]));
  check('unresolved names are candidates', ['storybook', 'agile', 'apacheairflow', 'snowflake'].every((n) => cands.has(n)), [...cands.keys()]);

  const sug = await suggest.suggestPending(25);
  const storybook = await prisma.skillCandidate.findUniqueOrThrow({ where: { normalizedName: 'storybook' }, include: { resolvedSkill: true } });
  check('embedding suggestion found for a close spelling', sug.suggested >= 1 && storybook.suggestionMethod === 'EMBEDDING', sug);
  check('auto-map (policy on) maps frequent multi-company name, flagged', storybook.status === 'MAPPED' && storybook.autoApproved && storybook.resolvedSkill?.name === 'Storybook JS', {
    status: storybook.status,
    auto: storybook.autoApproved,
  });
  check('auto-mapped alias relinked pending rows', (await prisma.marketJobSkill.count({ where: { normalizedName: 'storybook', skillId: null } })) === 0);
  const airflow = await prisma.skillCandidate.findUniqueOrThrow({ where: { normalizedName: 'apacheairflow' } });
  check('distant name gets no suggestion and stays PENDING', airflow.status === 'PENDING' && airflow.suggestedSkillId === null, airflow.note);

  const approved = await review.approveAsNew(airflow.id, {}, 'admin-test');
  check('approve as new Skill creates exactly one Skill and relinks', approved.relinked === 1 && (await prisma.skill.count()) === skillsBefore + 1, approved);
  const pg = await prisma.skillCandidate.create({
    data: { name: 'Postgres SQL', normalizedName: 'postgresql-dup-test', firstSeenAt: new Date(), lastSeenAt: new Date() },
  });
  check('approve refuses a name that already resolves (no duplicate Skill)', await rejects(() => review.approveAsNew(pg.id, { name: 'PostgreSQL' }, 'admin-test'), 'SKILL_EXISTS'));

  const snowflakeSkill = await prisma.skill.findUniqueOrThrow({ where: { name: 'Snowflake Data Cloud' } });
  const mapped = await review.mapToSkill(cands.get('snowflake')!.id, snowflakeSkill.id, 'admin-test');
  check('map as alias relinks pending rows and adds the alias', mapped.relinked === 1 && mapped.aliasAdded, mapped);
  const docker = await prisma.skill.findUniqueOrThrow({ where: { name: 'Docker' } });
  check('alias already owned by another skill is refused', await rejects(() => review.addAlias(docker.id, 'Snowflake', 'admin-test'), 'ALIAS_TAKEN'));

  const rejected = await review.reject(cands.get('agile')!.id, 'process term, not a skill for this report', 'admin-test');
  check('reject removes the rows', rejected.rowsRemoved === 2, rejected);

  await prisma.marketRawJob.updateMany({ data: { processingStatus: 'PENDING' } });
  await processAll();
  const rows = await prisma.marketJobSkill.findMany({ select: { normalizedName: true, skillId: true } });
  check('re-extraction: rejected name stays out', !rows.some((r) => r.normalizedName === 'agile'));
  const expected = await prisma.skill.findMany({ where: { name: { in: ['Storybook JS', 'Snowflake Data Cloud', 'Apache Airflow'] } }, select: { id: true } });
  const linked = new Set(rows.map((r) => r.skillId));
  check('re-extraction: mapped and approved names resolve, nothing left unresolved', rows.every((r) => !!r.skillId) && expected.length === 3 && expected.every((s) => linked.has(s.id)), rows);
  check('still no Skill rows created by ingestion', (await prisma.skill.count()) === skillsBefore + 1);

  const [nodeA, nodeB] = await Promise.all([
    prisma.skill.findUniqueOrThrow({ where: { name: 'Node.js' } }),
    prisma.skill.findUniqueOrThrow({ where: { name: 'Node JS' } }),
  ]);
  const dups = await review.duplicates();
  check('duplicate skills detected by normalized name', dups.some((d) => d.key === 'nodejs' && d.skills.length === 2), dups);
  const someRow = await prisma.marketJobSkill.findFirstOrThrow();
  await prisma.marketJobSkill.update({ where: { id: someRow.id }, data: { skillId: nodeB.id } });
  await prisma.skillAlias.create({ data: { skillId: nodeB.id, alias: 'NodeJS runtime', normalizedAlias: 'nodejsruntime', status: 'APPROVED', source: 'ADMIN' } });
  const dry = await review.mergeSkills(nodeB.id, nodeA.id, false, 'admin-test');
  check('merge dry run changes nothing', !dry.executed && dry.moves.marketJobSkill === 1 && dry.moves.skillAlias === 1 && !!(await prisma.skill.findUnique({ where: { id: nodeB.id } })), dry);
  const done = await review.mergeSkills(nodeB.id, nodeA.id, true, 'admin-test');
  const moved = await prisma.marketJobSkill.findUniqueOrThrow({ where: { id: someRow.id } });
  check('merge executes in a transaction: rows and aliases moved, source deleted', done.executed && moved.skillId === nodeA.id && !(await prisma.skill.findUnique({ where: { id: nodeB.id } })) && (await prisma.skillAlias.count({ where: { skillId: nodeA.id } })) === 1);

  const actions = (await review.log()).map((l) => l.action).sort();
  check('every decision is in the review log', ['APPROVE_NEW', 'AUTO_MAP', 'MAP_ALIAS', 'MERGE_SKILL', 'REJECT'].every((a) => actions.includes(a)), actions);

  await prisma.$disconnect();
  console.log(failures === 0 ? 'M7 INTEGRATION PASSED' : `M7 INTEGRATION FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
