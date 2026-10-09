import { Injectable, OnModuleInit } from '@nestjs/common';
import { MarketProcessingStatus, Prisma } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IntelConfigService } from '../../intel-config/intel-config.service';
import { findDuplicate } from '../normalize/dedupe';
import { normalizePosting, type NormalizedPosting } from '../normalize/normalize-posting';
import type { MarketStage, StageContext, StageRow } from './market-stage';
import { MarketProcessService } from './market-process.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * PENDING -> DEDUPED. Normalizes the posting and links it to a MarketJob: an existing one when it is the same
 * vacancy on another board (same company, title, compatible location, 45-day window, Jaccard >= 0.8), else a new one.
 * Already-linked rows only refresh their MarketJob, so reprocessing is idempotent.
 */
@Injectable()
export class DedupeStage implements MarketStage, OnModuleInit {
  readonly name = 'dedupe';
  readonly from = MarketProcessingStatus.PENDING;
  readonly to = MarketProcessingStatus.DEDUPED;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: IntelConfigService,
    private readonly pipeline: MarketProcessService,
  ) {}

  onModuleInit() {
    this.pipeline.registerStage(this);
  }

  async run(row: StageRow, ctx: StageContext) {
    const cfg = await this.dedupeConfig(ctx);
    const norm = normalizePosting(row, cfg.shingleSize);
    // Keep the old sketch when the description was purged, so dedupe still has something to compare.
    const keepSketch = row.rawDescription === null;

    if (row.marketJobId) {
      const job = await this.prisma.marketJob.findUnique({ where: { id: row.marketJobId } });
      if (job && (job.primaryRawJobId === row.id || job.primaryRawJobId === null)) {
        await this.prisma.marketJob.update({
          where: { id: job.id },
          data: { ...this.jobFields(norm, keepSketch), primaryRawJobId: row.id },
        });
      }
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      // Serialize dedupe per company so two boards processed in parallel cannot both create the same vacancy.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`market-dedupe:${row.source.companyId}`}))`;
      const anchor = (row.sourcePostedAt ?? row.firstSeenAt).getTime();
      const candidates = await tx.marketJob.findMany({
        where: {
          companyId: row.source.companyId,
          normalizedTitle: norm.normalizedTitle,
          firstSeenAt: { gte: new Date(anchor - cfg.windowDays * DAY_MS - 30 * DAY_MS) },
        },
        include: { rawJobs: { select: { sourceId: true } } },
        take: 50,
      });
      const dup = findDuplicate(
        {
          sourceId: row.sourceId,
          normalizedTitle: norm.normalizedTitle,
          countries: norm.countries,
          isRemote: norm.isRemote,
          postedAt: row.sourcePostedAt,
          firstSeenAt: row.firstSeenAt,
          shingleSketch: norm.shingleSketch,
        },
        candidates.map((c) => ({
          id: c.id,
          normalizedTitle: c.normalizedTitle,
          countries: c.countries,
          isRemote: c.isRemote,
          postedAt: c.postedAt,
          firstSeenAt: c.firstSeenAt,
          shingleSketch: c.shingleSketch,
          sourceIds: c.rawJobs.map((r) => r.sourceId),
        })),
        { windowDays: cfg.windowDays, jaccardThreshold: cfg.jaccardThreshold },
      );

      if (dup) {
        await tx.marketRawJob.update({ where: { id: row.id }, data: { marketJobId: dup.id } });
        await this.refreshJob(tx, dup.id);
        return;
      }
      const job = await tx.marketJob.create({
        data: {
          companyId: row.source.companyId,
          ...this.jobFields(norm, false),
          postedAt: row.sourcePostedAt,
          firstSeenAt: row.firstSeenAt,
          lastSeenAt: row.lastSeenAt,
          closedAt: row.closedAt,
          status: row.listingStatus,
          primaryRawJobId: row.id,
        },
      });
      await tx.marketRawJob.update({ where: { id: row.id }, data: { marketJobId: job.id } });
    });
  }

  private jobFields(norm: NormalizedPosting, keepSketch: boolean) {
    const { shingleSketch, ...rest } = norm;
    return keepSketch ? rest : { ...rest, shingleSketch };
  }

  /** Recomputes sourceCount, seen dates and listing status from every linked raw row. */
  private async refreshJob(tx: Prisma.TransactionClient, jobId: string) {
    const raws = await tx.marketRawJob.findMany({
      where: { marketJobId: jobId },
      select: { sourceId: true, firstSeenAt: true, lastSeenAt: true, closedAt: true, listingStatus: true, sourcePostedAt: true },
    });
    if (!raws.length) return;
    const open = raws.some((r) => r.listingStatus === 'OPEN');
    const stale = raws.some((r) => r.listingStatus === 'STALE');
    const posted = raws.map((r) => r.sourcePostedAt).filter((d): d is Date => !!d);
    await tx.marketJob.update({
      where: { id: jobId },
      data: {
        sourceCount: new Set(raws.map((r) => r.sourceId)).size,
        firstSeenAt: new Date(Math.min(...raws.map((r) => r.firstSeenAt.getTime()))),
        lastSeenAt: new Date(Math.max(...raws.map((r) => r.lastSeenAt.getTime()))),
        postedAt: posted.length ? new Date(Math.min(...posted.map((d) => d.getTime()))) : null,
        status: open ? 'OPEN' : stale ? 'STALE' : 'CLOSED',
        closedAt: open || stale ? null : new Date(Math.max(...raws.map((r) => (r.closedAt ?? r.lastSeenAt).getTime()))),
      },
    });
  }

  private async dedupeConfig(ctx: StageContext) {
    const key = 'config:dedupe';
    if (!ctx.cache.has(key)) ctx.cache.set(key, await this.config.get('dedupe'));
    return ctx.cache.get(key) as { windowDays: number; jaccardThreshold: number; shingleSize: number };
  }
}
