import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MarketProcessingStatus, MarketTrigger } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MarketConsumer, NonRetryableError, type HandlerResult } from '../queue/market-consumer';
import { MarketPublisher } from '../queue/market-publisher.service';
import { MARKET_QUEUES, type MarketMessage } from '../queue/market-queue.constants';
import type { MarketStage, StageContext, StageRow } from './market-stage';

const BATCH = 100;

/**
 * market.process: one task per source. Moves raw rows through the registered stages
 * (dedupe -> extract -> classify). Each stage is a checkpoint, so a retry resumes where it stopped.
 * A row that throws is marked FAILED with its error and does not block the rest of the batch.
 */
@Injectable()
export class MarketProcessService implements OnModuleInit {
  private readonly logger = new Logger(MarketProcessService.name);
  private readonly stages: MarketStage[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly consumer: MarketConsumer,
    private readonly publisher: MarketPublisher,
  ) {}

  onModuleInit() {
    this.consumer.register(MARKET_QUEUES.process, (message) => this.handle(message));
  }

  registerStage(stage: MarketStage) {
    if (this.stages.some((s) => s.from === stage.from)) throw new Error(`Two stages start at ${stage.from}`);
    this.stages.push(stage);
  }

  stageNames() {
    return this.orderedStages().map((s) => `${s.name}:${s.from}->${s.to}`);
  }

  /** Resets rows so they run again from the first stage. Rows whose text was purged only redo dedupe/classify. */
  async startReprocessRun(trigger: MarketTrigger, sourceIds: string[]) {
    await this.prisma.marketRawJob.updateMany({
      where: { sourceId: { in: sourceIds }, processingStatus: { not: MarketProcessingStatus.PENDING } },
      data: { processingStatus: MarketProcessingStatus.PENDING, processingError: null },
    });
    return this.publisher.startRun(
      'PROCESS',
      trigger,
      sourceIds.map((id) => ({ sourceId: id })),
    );
  }

  async handle(message: MarketMessage): Promise<HandlerResult> {
    const sourceId = String(message.payload.sourceId ?? '');
    const source = await this.prisma.marketSource.findUnique({ where: { id: sourceId }, select: { id: true } });
    if (!source) throw new NonRetryableError('SOURCE_NOT_FOUND');
    const result = await this.processBatch(sourceId);
    if (result.remaining > 0) {
      await this.publisher.enqueueFollowUp(message.runId, 'PROCESS', { sourceId });
    }
    return { counters: result.counters };
  }

  /** Processes up to BATCH rows of one source. Exposed for scripts and tests. */
  async processBatch(sourceId: string, ctx: StageContext = { now: new Date(), cache: new Map() }) {
    const stages = this.orderedStages();
    const byFrom = new Map(stages.map((s) => [s.from, s]));
    const counters: Record<string, number> = { processed: 0, rowFailures: 0 };
    if (!stages.length) return { counters, remaining: 0 };

    const rows = await this.prisma.marketRawJob.findMany({
      where: { sourceId, processingStatus: { in: [...byFrom.keys()] } },
      include: { source: { select: { id: true, companyId: true } } },
      orderBy: { firstSeenAt: 'asc' },
      take: BATCH,
    });
    for (const row of rows) {
      let current: StageRow = row;
      let stage = byFrom.get(row.processingStatus);
      try {
        while (stage) {
          await stage.run(current, ctx);
          // Reload so the next stage sees what this one wrote (e.g. the MarketJob link).
          current = await this.prisma.marketRawJob.update({
            where: { id: row.id },
            data: { processingStatus: stage.to, processingError: null },
            include: { source: { select: { id: true, companyId: true } } },
          });
          counters[stage.name] = (counters[stage.name] ?? 0) + 1;
          stage = byFrom.get(current.processingStatus);
        }
        counters.processed += 1;
      } catch (err) {
        counters.rowFailures += 1;
        const text = `${stage?.name ?? 'stage'}: ${(err as Error).message}`.slice(0, 1000);
        this.logger.warn(`Raw job ${row.id} failed at ${text}`);
        await this.prisma.marketRawJob.update({
          where: { id: row.id },
          data: { processingStatus: MarketProcessingStatus.FAILED, processingError: text },
        });
      }
    }
    const remaining = await this.prisma.marketRawJob.count({
      where: { sourceId, processingStatus: { in: [...byFrom.keys()] } },
    });
    const stageCounters = (ctx.cache.get('counters') as Record<string, number> | undefined) ?? {};
    return { counters: { ...counters, ...stageCounters }, remaining };
  }

  private orderedStages(): MarketStage[] {
    const ordered: MarketStage[] = [];
    let next = this.stages.find((s) => s.from === MarketProcessingStatus.PENDING);
    while (next && !ordered.includes(next)) {
      ordered.push(next);
      next = this.stages.find((s) => s.from === next!.to);
    }
    return ordered;
  }
}
