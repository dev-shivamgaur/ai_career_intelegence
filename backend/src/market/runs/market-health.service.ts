import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { marketFlags } from '../market.flags';
import { MarketRabbitConnection } from '../queue/market-rabbit.connection';
import { fetchBlocker, termsReviewProblem } from '../sources/compliance';

/** Admin health view: queue and DLQ depth, per-source fetch health, compliance state and raw-job counts. */
@Injectable()
export class MarketHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: MarketRabbitConnection,
  ) {}

  async health() {
    const now = new Date();
    const [sources, listing, processing, purged, queues] = await Promise.all([
      this.prisma.marketSource.findMany({
        include: { company: { select: { name: true, active: true } } },
        orderBy: [{ company: { name: 'asc' } }, { type: 'asc' }],
      }),
      this.prisma.marketRawJob.groupBy({ by: ['sourceId', 'listingStatus'], _count: { _all: true } }),
      this.prisma.marketRawJob.groupBy({ by: ['sourceId', 'processingStatus'], _count: { _all: true } }),
      this.prisma.marketRawJob.groupBy({
        by: ['sourceId'],
        where: { contentPurgedAt: { not: null } },
        _count: { _all: true },
      }),
      this.rabbit.queueDepths().catch(() => []),
    ]);
    const bucket = (rows: Array<{ sourceId: string; _count: { _all: number } } & Record<string, unknown>>, key: string) => {
      const out = new Map<string, Record<string, number>>();
      for (const row of rows) {
        const m = out.get(row.sourceId) ?? {};
        m[String(row[key])] = row._count._all;
        out.set(row.sourceId, m);
      }
      return out;
    };
    const listingBy = bucket(listing, 'listingStatus');
    const processingBy = bucket(processing, 'processingStatus');
    const purgedBy = new Map(purged.map((p) => [p.sourceId, p._count._all]));
    return {
      flags: {
        pipeline: marketFlags.pipeline(),
        scheduler: marketFlags.scheduler(),
        llmExtraction: marketFlags.llmExtraction(),
      },
      queueReady: this.rabbit.isReady(),
      queues,
      sources: sources.map((s) => ({
        id: s.id,
        company: s.company.name,
        type: s.type,
        boardToken: s.boardToken,
        enabled: s.enabled,
        pausedReason: s.pausedReason,
        termsProblem: termsReviewProblem(s, now),
        fetchBlocker: fetchBlocker(s, now),
        termsReviewDueAt: s.termsReviewDueAt,
        robotsStatus: s.robotsStatus,
        lastFetchAt: s.lastFetchAt,
        lastSuccessAt: s.lastSuccessAt,
        lastError: s.lastError,
        consecutiveFailures: s.consecutiveFailures,
        listing: listingBy.get(s.id) ?? {},
        processing: processingBy.get(s.id) ?? {},
        contentPurged: purgedBy.get(s.id) ?? 0,
      })),
    };
  }
}
