import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { MarketFetchService } from '../ingest/market-fetch.service';
import { marketFlags } from '../market.flags';
import { MarketRetentionService } from '../retention/market-retention.service';
import { MarketRunService } from '../runs/market-run.service';
import { marketSlotAt, type MarketSlot } from './ist-slot';

type SlotRunner = (windowKey: string) => Promise<unknown>;

/**
 * 02:00 IST retention, 06:00 IST fetch of due sources, 20:00 IST aggregation.
 * API process only, and only with MARKET_SCHEDULER_ENABLED and MARKET_PIPELINE_ENABLED.
 * Redis setNx avoids double work; the MarketRun windowKey check stays authoritative (Redis may be in-memory).
 */
@Injectable()
export class MarketScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MarketScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly runners = new Map<MarketSlot, SlotRunner>();

  constructor(
    private readonly redis: RedisService,
    private readonly runs: MarketRunService,
    fetch: MarketFetchService,
    retention: MarketRetentionService,
  ) {
    this.runners.set('fetch', (windowKey) => fetch.startFetchRun('SCHEDULER', 'due', windowKey));
    this.runners.set('retention', (windowKey) => retention.startRetentionRun('SCHEDULER', windowKey));
  }

  /** Aggregation registers itself once the demand engine exists. */
  registerSlot(slot: MarketSlot, runner: SlotRunner) {
    this.runners.set(slot, runner);
  }

  onApplicationBootstrap() {
    if (process.env.INGEST_WORKER === '1') return;
    if (!marketFlags.scheduler() || !marketFlags.pipeline()) return;
    this.logger.log('Market scheduler on (02:00 retention, 06:00 fetch, 20:00 aggregate IST; tick every 10 minutes)');
    this.timer = setInterval(() => void this.tick(new Date()), 10 * 60 * 1000);
    setTimeout(() => void this.tick(new Date()), 15_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now: Date) {
    const slot = marketSlotAt(now);
    if (!slot) return;
    const runner = this.runners.get(slot.slot);
    if (!runner) return;
    if (!(await this.redis.setNx(`market:sched:${slot.windowKey}`, '1', 3 * 60 * 60))) return;
    try {
      if (await this.runs.findRunInWindow(slot.windowKey)) return;
      const result = await runner(slot.windowKey);
      this.logger.log(`Market ${slot.slot} window ${slot.windowKey}: ${JSON.stringify(result)}`);
    } catch (err) {
      this.logger.warn(`Market ${slot.slot} window ${slot.windowKey} failed: ${(err as Error).message}`);
      await this.redis.del(`market:sched:${slot.windowKey}`).catch(() => undefined);
    }
  }
}
