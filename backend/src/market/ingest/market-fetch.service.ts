import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MarketTrigger, Prisma, type Company, type MarketSource } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IntelConfigService } from '../../intel-config/intel-config.service';
import { ConnectorRegistry } from '../connectors/connector-registry';
import type { RawJobPayload } from '../connectors/source-connector';
import { MarketFetchError, MarketHttpClient } from '../http/market-http-client';
import { MarketConsumer, NonRetryableError, type HandlerResult } from '../queue/market-consumer';
import { MarketPublisher } from '../queue/market-publisher.service';
import { MARKET_MAX_ATTEMPTS, MARKET_QUEUES, type MarketMessage } from '../queue/market-queue.constants';
import { effectiveRetention, fetchBlocker, termsReviewProblem, type EffectiveRetention } from '../sources/compliance';
import { syncMarketJobsForSource } from '../process/market-job-sync';
import { planRawJobs } from './raw-job-diff';

const MAX_DESCRIPTION_CHARS = 100_000;
const CHUNK = 200;
const HOUR_MS = 60 * 60 * 1000;
/** A source due within this slack of the 06:00 slot is fetched now rather than skipped for a day. */
const DUE_SLACK_MS = 2 * HOUR_MS;

type SourceWithCompany = MarketSource & { company: Company };

/** market.fetch: one task per source. Compliance gate, board fetch, change detection, closed/stale, source health. */
@Injectable()
export class MarketFetchService implements OnModuleInit {
  private readonly logger = new Logger(MarketFetchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectors: ConnectorRegistry,
    private readonly http: MarketHttpClient,
    private readonly config: IntelConfigService,
    private readonly consumer: MarketConsumer,
    private readonly publisher: MarketPublisher,
  ) {}

  onModuleInit() {
    this.consumer.register(MARKET_QUEUES.fetch, (message) => this.handle(message));
  }

  /** Enqueues a FETCH run. "due" picks enabled, unblocked sources whose crawl interval has elapsed. */
  async startFetchRun(trigger: MarketTrigger, selection: 'due' | 'all' | string[], windowKey?: string) {
    const now = new Date();
    const sources = await this.prisma.marketSource.findMany({
      where: Array.isArray(selection) ? { id: { in: selection } } : { enabled: true },
      include: { company: true },
    });
    if (Array.isArray(selection)) {
      const blocked = sources.map((s) => ({ id: s.id, blocker: fetchBlocker(s, now) })).filter((b) => b.blocker);
      if (blocked.length || sources.length !== selection.length) {
        throw new BadRequestException({
          error: 'SOURCES_NOT_FETCHABLE',
          message: 'Some sources cannot be fetched',
          blocked,
          missing: selection.filter((id) => !sources.some((s) => s.id === id)),
        });
      }
    }
    const eligible = sources.filter((s) => {
      if (fetchBlocker(s, now)) return false;
      if (selection !== 'due') return true;
      if (!s.lastSuccessAt) return true;
      return s.lastSuccessAt.getTime() + s.crawlIntervalHours * HOUR_MS - DUE_SLACK_MS <= now.getTime();
    });
    return this.publisher.startRun(
      'FETCH',
      trigger,
      eligible.map((s) => ({ sourceId: s.id })),
      windowKey,
    );
  }

  async handle(message: MarketMessage): Promise<HandlerResult> {
    const sourceId = String(message.payload.sourceId ?? '');
    const source = await this.prisma.marketSource.findUnique({ where: { id: sourceId }, include: { company: true } });
    if (!source) throw new NonRetryableError('SOURCE_NOT_FOUND');
    const now = new Date();
    if (termsReviewProblem(source, now) === 'TERMS_REVIEW_EXPIRED' && source.enabled) {
      await this.prisma.marketSource.update({
        where: { id: source.id },
        data: { enabled: false, pausedReason: 'TERMS_REVIEW_EXPIRED' },
      });
      this.logger.warn(`Source ${source.id} paused: terms review expired`);
      return { status: 'SKIPPED', note: 'Skipped: TERMS_REVIEW_EXPIRED (source paused)', counters: { skipped: 1 } };
    }
    const blocker = fetchBlocker(source, now);
    if (blocker) return { status: 'SKIPPED', note: `Skipped: ${blocker}`, counters: { skipped: 1 } };
    return this.ingest(source, message, now);
  }

  private async ingest(source: SourceWithCompany, message: MarketMessage, now: Date): Promise<HandlerResult> {
    const [fetchCfg, retention] = await Promise.all([this.config.get('fetch'), this.config.get('retention')]);
    const policy = effectiveRetention(source, retention);
    let fetched: { jobs: RawJobPayload[]; robots: 'ALLOWED' | 'DISALLOWED' | 'UNKNOWN' };
    try {
      fetched = await this.connectors.get(source.type).fetch(source.boardToken, this.http);
    } catch (err) {
      const e = err instanceof MarketFetchError ? err : new MarketFetchError('NETWORK', (err as Error).message, true);
      const final = !e.retryable || message.attempt >= MARKET_MAX_ATTEMPTS;
      await this.recordFailure(source, e, final, fetchCfg.circuitBreakerFailures, now);
      if (!e.retryable) throw new NonRetryableError(`${e.code}: ${e.message}`);
      throw e;
    }

    const existing = await this.prisma.marketRawJob.findMany({
      where: { sourceId: source.id },
      select: {
        id: true,
        externalId: true,
        contentHash: true,
        listingStatus: true,
        sourcePostedAt: true,
        firstSeenAt: true,
        contentPurgedAt: true,
      },
    });
    const plan = planRawJobs(existing, fetched.jobs, { now, staleAfterDays: fetchCfg.staleAfterDays });

    for (let i = 0; i < plan.create.length; i += CHUNK) {
      await this.prisma.marketRawJob.createMany({
        data: plan.create.slice(i, i + CHUNK).map(({ job, hash, stale }) => ({
          sourceId: source.id,
          externalId: job.externalId,
          ...this.contentFields(job, hash, policy, now),
          firstSeenAt: now,
          lastSeenAt: now,
          listingStatus: stale ? 'STALE' : 'OPEN',
        })),
        skipDuplicates: true,
      });
    }
    for (const { id, job, hash } of plan.changed) {
      await this.prisma.marketRawJob.update({
        where: { id },
        data: {
          ...this.contentFields(job, hash, policy, now),
          lastSeenAt: now,
          processingStatus: 'PENDING',
          processingError: null,
          contentPurgedAt: null,
        },
      });
    }
    // Content purged while the job was gone, then re-listed unchanged: restore the text (no reprocessing needed).
    const purgedUnchanged = new Set(existing.filter((e) => e.contentPurgedAt).map((e) => e.id));
    const fetchedById = new Map(fetched.jobs.map((j) => [j.externalId, j]));
    for (const row of existing) {
      if (!purgedUnchanged.has(row.id) || !plan.unchangedIds.includes(row.id)) continue;
      const job = fetchedById.get(row.externalId);
      if (!job) continue;
      await this.prisma.marketRawJob.update({
        where: { id: row.id },
        data: { rawDescription: job.descriptionText.slice(0, MAX_DESCRIPTION_CHARS), contentPurgedAt: null },
      });
    }
    await this.updateMany(plan.unchangedIds, { lastSeenAt: now });
    await this.updateMany(plan.reopenedIds, { listingStatus: 'OPEN', closedAt: null });
    await this.updateMany(plan.staleIds, { listingStatus: 'STALE' });
    await this.updateMany(plan.closeIds, { listingStatus: 'CLOSED', closedAt: now });
    await syncMarketJobsForSource(this.prisma, source.id);

    await this.prisma.marketSource.update({
      where: { id: source.id },
      data: {
        lastFetchAt: now,
        lastSuccessAt: now,
        lastError: plan.suspiciousEmpty ? 'Board returned 0 jobs; nothing closed' : null,
        consecutiveFailures: 0,
        robotsStatus: fetched.robots,
        robotsCheckedAt: now,
      },
    });

    let processQueued = 0;
    if (plan.create.length + plan.changed.length > 0) {
      try {
        await this.publisher.enqueueFollowUp(message.runId, 'PROCESS', { sourceId: source.id });
        processQueued = 1;
      } catch (err) {
        this.logger.warn(`Could not enqueue processing for source ${source.id}: ${(err as Error).message}`);
      }
    }
    return {
      counters: {
        fetched: fetched.jobs.length,
        new: plan.create.length,
        changed: plan.changed.length,
        unchanged: plan.unchangedIds.length,
        closed: plan.closeIds.length,
        stale: plan.staleIds.length,
        reopened: plan.reopenedIds.length,
        processQueued,
      },
      note: plan.suspiciousEmpty ? 'Board returned 0 jobs while jobs were open; nothing was closed' : undefined,
    };
  }

  private contentFields(job: RawJobPayload, hash: string, policy: EffectiveRetention, now: Date) {
    return {
      rawTitle: job.title.slice(0, 500),
      rawLocation: job.location?.slice(0, 500) ?? null,
      rawDescription: job.descriptionText.slice(0, MAX_DESCRIPTION_CHARS),
      rawPayload: policy.storeRawPayload ? (job.raw as Prisma.InputJsonValue) : Prisma.DbNull,
      rawPayloadStoredAt: policy.storeRawPayload ? now : null,
      url: job.url,
      department: job.department,
      employmentType: job.employmentType,
      workplaceType: job.workplaceType,
      contentHash: hash,
      sourcePostedAt: job.postedAt,
      sourceUpdatedAt: job.sourceUpdatedAt,
    };
  }

  private async updateMany(ids: string[], data: Prisma.MarketRawJobUpdateManyMutationInput) {
    for (let i = 0; i < ids.length; i += 1000) {
      await this.prisma.marketRawJob.updateMany({ where: { id: { in: ids.slice(i, i + 1000) } }, data });
    }
  }

  /** Every attempt updates lastError; only a task's final failure counts toward the circuit breaker. */
  private async recordFailure(source: MarketSource, err: MarketFetchError, final: boolean, threshold: number, now: Date) {
    const failures = source.consecutiveFailures + (final ? 1 : 0);
    const trip = final && failures >= threshold;
    await this.prisma.marketSource.update({
      where: { id: source.id },
      data: {
        lastFetchAt: now,
        lastError: `${err.code}: ${err.message}`.slice(0, 1000),
        consecutiveFailures: failures,
        ...(err.code === 'ROBOTS_DISALLOWED' ? { robotsStatus: 'DISALLOWED' as const, robotsCheckedAt: now } : {}),
        ...(trip ? { enabled: false, pausedReason: 'CIRCUIT_BREAKER' } : {}),
      },
    });
    if (trip) this.logger.warn(`Source ${source.id} disabled by circuit breaker after ${failures} failed fetches`);
  }
}
