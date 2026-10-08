import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { IngestTrigger } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IngestEnqueueService } from '../queue/ingest-enqueue.service';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Two checks each day in India time: 08:00–08:59 and 18:00–18:59.
 * Each window enqueues at most one run, even across restarts, because the
 * check looks for an existing SCHEDULER run in PostgreSQL. It only adds missing topics.
 *
 * Set FIELD_INGEST_DEBUG=1 to:
 * - run ingestAll() once when the backend starts (no need to wait for 8 AM / 6 PM)
 * - treat the current IST hour as a valid slot on the 10-minute tick
 * - log every scheduler decision to the console
 */
@Injectable()
export class FieldIngestScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FieldIngestScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private lastSlot = '';
  private running = false;

  constructor(
    private readonly enqueue: IngestEnqueueService,
    private readonly prisma: PrismaService,
  ) {}

  private debugMode(): boolean {
    return process.env.FIELD_INGEST_DEBUG === '1' || process.env.FIELD_INGEST_DEBUG === 'true';
  }

  /** Bootstrap, not module init: RabbitConnection connects in its own onModuleInit and must finish first. */
  onApplicationBootstrap() {
    if (process.env.INGEST_WORKER === '1') return;
    console.log('[FieldIngestScheduler] Backend started — scheduler registered (tick every 10 minutes)');
    this.timer = setInterval(() => void this.tick('interval'), 10 * 60 * 1000);
    if (this.debugMode()) {
      console.log('[FieldIngestScheduler] FIELD_INGEST_DEBUG is ON — enqueueing ingest run once now on startup');
      void this.enqueue.startRun('SCHEDULER').catch((err: Error) => {
        console.log('[FieldIngestScheduler] enqueue failed', err.message);
      });
    } else {
      void this.tick('startup');
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(reason: 'startup' | 'interval') {
    const slot = this.slotNow();
    console.log('[FieldIngestScheduler] tick', {
      reason,
      istSlot: slot ?? '(not 8 AM / 6 PM IST — skipping ingest)',
      lastSlot: this.lastSlot || '(none)',
      running: this.running,
      debugMode: this.debugMode(),
    });
    if (!slot) return;
    if (slot === this.lastSlot) {
      console.log('[FieldIngestScheduler] Same slot as last run — ingest already done for this window');
      return;
    }
    if (this.running) {
      console.log('[FieldIngestScheduler] Previous ingest still running — skip');
      return;
    }
    await this.enqueueRun(slot);
  }

  private async enqueueRun(slot: string) {
    this.lastSlot = slot;
    this.running = true;
    try {
      const existing = await this.prisma.ingestRun.findFirst({
        where: { trigger: IngestTrigger.SCHEDULER, createdAt: { gte: this.currentIstHourStart() } },
        select: { id: true },
      });
      if (existing) {
        console.log('[FieldIngestScheduler] Run already exists for this window — skip', { slot, runId: existing.id });
        return;
      }
      console.log('[FieldIngestScheduler] >>> Enqueueing ingest run', { slot });
      const queued = await this.enqueue.startRun('SCHEDULER');
      const msg = `Syllabus check ${slot}: queued ${queued.jobCount} careers (run ${queued.runId})`;
      console.log('[FieldIngestScheduler] <<<', msg);
      this.logger.log(msg);
    } catch (err) {
      console.log('[FieldIngestScheduler] enqueue FAILED', (err as Error).message);
      this.logger.warn(`Syllabus check failed: ${(err as Error).message}`);
      this.lastSlot = '';
    } finally {
      this.running = false;
    }
  }

  /** IST has no daylight saving, so a fixed offset gives the exact start of the current India hour. */
  private currentIstHourStart(): Date {
    const istMs = Date.now() + IST_OFFSET_MS;
    return new Date(istMs - (istMs % HOUR_MS) - IST_OFFSET_MS);
  }

  private slotNow(): string | null {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    const hour = Number(get('hour'));
    const minute = get('minute');
    const day = `${get('year')}-${get('month')}-${get('day')}`;
    const istNow = `${day} ${String(hour).padStart(2, '0')}:${minute} IST`;

    if (this.debugMode()) {
      const debugSlot = `${day}-hour-${hour}`;
      console.log('[FieldIngestScheduler] slotNow (DEBUG)', { istNow, debugSlot, note: 'current hour counts as valid slot' });
      return debugSlot;
    }

    console.log('[FieldIngestScheduler] slotNow', { istNow, hour, valid: hour === 8 || hour === 18 });
    if (hour === 8) return `${day}-morning`;
    if (hour === 18) return `${day}-evening`;
    return null;
  }
}
