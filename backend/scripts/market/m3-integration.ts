/**
 * M3 acceptance checks against a SCRATCH database (run via run-integration.ps1, never against dev).
 * Uses a fixture-backed connector (no network) and the real MarketFetchService / MarketRetentionService.
 * The terms review written here is test data inside the throwaway database only.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '../../src/prisma/client';
import { INTEL_DEFAULTS } from '../../src/intel-config/intel-config.defaults';
import { GreenhouseConnector } from '../../src/market/connectors/greenhouse.connector';
import type { RawJobPayload } from '../../src/market/connectors/source-connector';
import { MarketFetchError } from '../../src/market/http/market-http-client';
import { MarketFetchService } from '../../src/market/ingest/market-fetch.service';
import { NonRetryableError } from '../../src/market/queue/market-consumer';
import type { MarketMessage } from '../../src/market/queue/market-queue.constants';
import { MarketRetentionService } from '../../src/market/retention/market-retention.service';

const DAY = 24 * 60 * 60 * 1000;
let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
}

async function main() {
  if (!/ai_market_it/.test(process.env.DATABASE_URL ?? '')) throw new Error('Refusing to run outside the ai_market_it scratch database');
  const prisma = new PrismaClient();
  const fixture = JSON.parse(readFileSync(join(__dirname, '../../src/market/connectors/__fixtures__/greenhouse.json'), 'utf8'));
  const baseBoard: RawJobPayload[] = new GreenhouseConnector().parse(fixture);
  let board: RawJobPayload[] = baseBoard;
  let failNext: MarketFetchError | null = null;

  const connector = {
    fetch: async () => {
      if (failNext) throw failNext;
      return { jobs: board, fetchedUrl: 'fixture://greenhouse', robots: 'ALLOWED' as const };
    },
  };
  const config = { get: async (key: keyof typeof INTEL_DEFAULTS) => INTEL_DEFAULTS[key] };
  const followUps: string[] = [];
  const publisher = { enqueueFollowUp: async (_run: string, kind: string) => (followUps.push(kind), 'task') };
  const consumer = { register: () => undefined };
  const fetchService = new MarketFetchService(
    prisma as never,
    { get: () => connector } as never,
    {} as never,
    config as never,
    consumer as never,
    publisher as never,
  );
  const retention = new MarketRetentionService(prisma as never, config as never, consumer as never, publisher as never);

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
  const good = await prisma.marketSource.create({ data: { companyId: company.id, type: 'GREENHOUSE', boardToken: 'fixture', ...terms } });
  const bad = await prisma.marketSource.create({ data: { companyId: company.id, type: 'LEVER', boardToken: 'broken', ...terms } });
  const msg = (sourceId: string, attempt = 1): MarketMessage => ({
    taskId: 't',
    runId: 'r',
    queue: 'market.fetch',
    attempt,
    payload: { sourceId },
  });

  const first = await fetchService.handle(msg(good.id));
  check('first run inserts every fixture job', first.counters?.new === baseBoard.length, first.counters);
  check('first run queues processing once', followUps.length === 1);

  const second = await fetchService.handle(msg(good.id));
  check('second run over unchanged board: 0 new, 0 changed', second.counters?.new === 0 && second.counters?.changed === 0, second.counters);
  check('second run queues no processing', followUps.length === 1);

  board = [{ ...baseBoard[0], descriptionText: `${baseBoard[0].descriptionText} Now also Kubernetes.` }, ...baseBoard.slice(2)];
  const third = await fetchService.handle(msg(good.id));
  check('missing job flagged closed, edited job changed', third.counters?.closed === 1 && third.counters?.changed === 1, third.counters);
  const closed = await prisma.marketRawJob.findFirst({ where: { sourceId: good.id, externalId: baseBoard[1].externalId } });
  check('closed job has closedAt and CLOSED status', closed?.listingStatus === 'CLOSED' && !!closed.closedAt);
  const changed = await prisma.marketRawJob.findFirst({ where: { sourceId: good.id, externalId: baseBoard[0].externalId } });
  check('changed job reset to PENDING for reprocessing', changed?.processingStatus === 'PENDING');
  check('raw payload not stored by default', changed?.rawPayload === null);

  // Failing source: retries do not count; only final failures move the circuit breaker.
  failNext = new MarketFetchError('HTTP_SERVER_ERROR', 'HTTP 503', true, 503);
  let threw = false;
  try {
    await fetchService.handle(msg(bad.id, 1));
  } catch {
    threw = true;
  }
  let badRow = await prisma.marketSource.findUniqueOrThrow({ where: { id: bad.id } });
  check('retryable failure rethrows (queue retries) without counting', threw && badRow.consecutiveFailures === 0 && !!badRow.lastError);
  for (let i = 0; i < INTEL_DEFAULTS.fetch.circuitBreakerFailures; i += 1) {
    await fetchService.handle(msg(bad.id, 3)).catch(() => undefined);
  }
  badRow = await prisma.marketSource.findUniqueOrThrow({ where: { id: bad.id } });
  check('circuit breaker disables source after final failures', !badRow.enabled && badRow.pausedReason === 'CIRCUIT_BREAKER', {
    failures: badRow.consecutiveFailures,
  });
  failNext = null;
  const isolated = await fetchService.handle(msg(good.id));
  check('the healthy source still fetches after the other failed', isolated.counters?.unchanged !== undefined, isolated.counters);
  const skipped = await fetchService.handle(msg(bad.id));
  check('the disabled source is skipped, not fetched', skipped.status === 'SKIPPED', skipped.note);

  failNext = new MarketFetchError('ROBOTS_DISALLOWED', 'robots.txt disallows /', false);
  await prisma.marketSource.update({ where: { id: bad.id }, data: { enabled: true, pausedReason: null, consecutiveFailures: 0 } });
  let nonRetryable = false;
  try {
    await fetchService.handle(msg(bad.id, 1));
  } catch (err) {
    nonRetryable = err instanceof NonRetryableError;
  }
  badRow = await prisma.marketSource.findUniqueOrThrow({ where: { id: bad.id } });
  check('robots disallow is non-retryable (straight to DLQ) and recorded', nonRetryable && badRow.robotsStatus === 'DISALLOWED');
  failNext = null;

  // Retention: 1-day policy on the source; age the closed job's closedAt by 2 days.
  await prisma.marketSource.update({ where: { id: good.id }, data: { descriptionRetentionDays: 1 } });
  await prisma.marketRawJob.update({ where: { id: closed!.id }, data: { closedAt: new Date(Date.now() - 2 * DAY) } });
  const purge = await retention.purgeSource(good.id, 'policy');
  const purgedRow = await prisma.marketRawJob.findUniqueOrThrow({ where: { id: closed!.id } });
  const openRows = await prisma.marketRawJob.count({ where: { sourceId: good.id, rawDescription: { not: null } } });
  check('1-day policy purges only the expired description', purge.descriptionsPurged === 1, purge);
  check(
    'purge keeps structured fields',
    purgedRow.rawDescription === null &&
      !!purgedRow.contentPurgedAt &&
      purgedRow.rawTitle === closed!.rawTitle &&
      purgedRow.contentHash === closed!.contentHash &&
      purgedRow.listingStatus === 'CLOSED',
  );
  check('open jobs keep their descriptions', openRows === baseBoard.length - 1, { openRows });

  const full = await retention.purgeSource(good.id, 'full');
  check('full purge (terms narrowed) clears all remaining raw text', full.descriptionsPurged === baseBoard.length - 1, full);

  await prisma.marketSource.update({ where: { id: good.id }, data: { termsReviewDueAt: new Date(Date.now() - DAY) } });
  const expired = await fetchService.handle(msg(good.id));
  const goodRow = await prisma.marketSource.findUniqueOrThrow({ where: { id: good.id } });
  check('expired terms review auto-pauses the source', expired.status === 'SKIPPED' && !goodRow.enabled && goodRow.pausedReason === 'TERMS_REVIEW_EXPIRED');

  await prisma.$disconnect();
  console.log(failures === 0 ? 'M3 INTEGRATION PASSED' : `M3 INTEGRATION FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
