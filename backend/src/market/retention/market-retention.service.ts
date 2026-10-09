import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { MarketTrigger, Prisma } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IntelConfigService } from '../../intel-config/intel-config.service';
import { MarketConsumer, NonRetryableError, type HandlerResult } from '../queue/market-consumer';
import { MarketPublisher } from '../queue/market-publisher.service';
import { MARKET_QUEUES, type MarketMessage } from '../queue/market-queue.constants';
import { effectiveRetention } from '../sources/compliance';
import { retentionCutoffs } from './retention-policy';

export type PurgeMode = 'policy' | 'full';
export type PurgeResult = { descriptionsPurged: number; payloadsPurged: number; excerptsCleared: number };

type ExcerptPurger = (sourceId: string, maxChars: number, full: boolean) => Promise<number>;

/**
 * Source-aware retention. Purges raw text (description, payload) and keeps metadata, contentHash and
 * structured downstream rows, so demand and trend history survive. Purged rows cannot be re-extracted.
 */
@Injectable()
export class MarketRetentionService implements OnModuleInit {
  private readonly logger = new Logger(MarketRetentionService.name);
  private readonly excerptPurgers: ExcerptPurger[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: IntelConfigService,
    private readonly consumer: MarketConsumer,
    private readonly publisher: MarketPublisher,
  ) {}

  onModuleInit() {
    this.consumer.register(MARKET_QUEUES.retention, (message) => this.handle(message));
  }

  /** Later stages that store evidence excerpts register here so the purge covers them too. */
  registerExcerptPurger(purger: ExcerptPurger) {
    this.excerptPurgers.push(purger);
  }

  async startRetentionRun(trigger: MarketTrigger, windowKey?: string) {
    const sources = await this.prisma.marketSource.findMany({ select: { id: true } });
    return this.publisher.startRun(
      'RETENTION',
      trigger,
      sources.map((s) => ({ sourceId: s.id })),
      windowKey,
    );
  }

  async handle(message: MarketMessage): Promise<HandlerResult> {
    const sourceId = String(message.payload.sourceId ?? '');
    const exists = await this.prisma.marketSource.findUnique({ where: { id: sourceId }, select: { id: true } });
    if (!exists) throw new NonRetryableError('SOURCE_NOT_FOUND');
    const result = await this.purgeSource(sourceId, 'policy');
    return { counters: result };
  }

  async purgeSource(sourceId: string, mode: PurgeMode, now = new Date()): Promise<PurgeResult> {
    const source = await this.prisma.marketSource.findUnique({ where: { id: sourceId } });
    if (!source) throw new NotFoundException({ error: 'SOURCE_NOT_FOUND', message: 'Market source not found' });
    const policy = effectiveRetention(source, await this.config.get('retention'));
    const cut = retentionCutoffs(policy, now);
    const textGone = { rawDescription: null, rawPayload: Prisma.DbNull, rawPayloadStoredAt: null, contentPurgedAt: now };

    const descriptions = await this.prisma.marketRawJob.updateMany({
      where:
        mode === 'full'
          ? { sourceId, OR: [{ rawDescription: { not: null } }, { rawPayload: { not: Prisma.DbNull } }] }
          : {
              sourceId,
              rawDescription: { not: null },
              OR: [
                { closedAt: { lt: cut.descriptionBefore } },
                { closedAt: null, lastSeenAt: { lt: cut.descriptionBefore } },
              ],
            },
      data: textGone,
    });

    let payloads = { count: 0 };
    if (mode === 'policy') {
      payloads = await this.prisma.marketRawJob.updateMany({
        where: {
          sourceId,
          rawPayload: { not: Prisma.DbNull },
          ...(cut.payloadBefore ? { rawPayloadStoredAt: { lt: cut.payloadBefore } } : {}),
        },
        data: { rawPayload: Prisma.DbNull, rawPayloadStoredAt: null },
      });
    }

    let excerptsCleared = 0;
    for (const purger of this.excerptPurgers) {
      excerptsCleared += await purger(sourceId, policy.evidenceExcerptMaxChars, mode === 'full');
    }
    const result = { descriptionsPurged: descriptions.count, payloadsPurged: payloads.count, excerptsCleared };
    if (descriptions.count || payloads.count || excerptsCleared) {
      this.logger.log(`Retention ${mode} for source ${sourceId}: ${JSON.stringify(result)}`);
    }
    return result;
  }
}
