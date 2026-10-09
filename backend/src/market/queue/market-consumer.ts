import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { marketFlags } from '../market.flags';
import { MarketRunService } from '../runs/market-run.service';
import { MarketRabbitConnection, assertMarketTopology } from './market-rabbit.connection';
import {
  MARKET_MAX_ATTEMPTS,
  MARKET_RETRY_DELAYS_MS,
  type MarketMessage,
  type MarketQueueName,
} from './market-queue.constants';

export type HandlerResult = { status?: 'COMPLETED' | 'SKIPPED'; counters?: Record<string, unknown>; note?: string };
export type MarketHandler = (message: MarketMessage) => Promise<HandlerResult>;

/** Thrown by handlers for failures that retrying cannot fix (bad data, compliance block). Goes straight to the DLQ. */
export class NonRetryableError extends Error {}

/**
 * Consumes market.* queues in the worker when WORKER_QUEUES lists "market" and MARKET_PIPELINE_ENABLED is on.
 * Retries park in market.retry (TTL) instead of holding a prefetch slot; final failures nack to the per-queue DLQ.
 */
@Injectable()
export class MarketConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(MarketConsumer.name);
  private readonly handlers = new Map<MarketQueueName, MarketHandler>();

  constructor(
    private readonly rabbit: MarketRabbitConnection,
    private readonly runs: MarketRunService,
  ) {}

  register(queue: MarketQueueName, handler: MarketHandler) {
    this.handlers.set(queue, handler);
  }

  onApplicationBootstrap() {
    if (!marketFlags.pipeline() || !marketFlags.worker()) return;
    this.rabbit.onReady((connection) => this.subscribe(connection));
  }

  private async subscribe(connection: ChannelModel) {
    const channel = await connection.createChannel();
    await assertMarketTopology(channel);
    const prefetch = Math.max(1, Number(process.env.MARKET_WORKER_CONCURRENCY || 2));
    await channel.prefetch(prefetch);
    for (const [queue, handler] of this.handlers) {
      await channel.consume(queue, (msg) => {
        if (msg) void this.handle(channel, msg, handler);
      });
    }
    this.logger.log(`Market worker consuming ${[...this.handlers.keys()].join(', ') || '(no handlers)'} (prefetch ${prefetch})`);
  }

  async handle(channel: Pick<Channel, 'ack' | 'nack'>, msg: ConsumeMessage, handler: MarketHandler) {
    let body: MarketMessage;
    try {
      body = JSON.parse(msg.content.toString()) as MarketMessage;
    } catch {
      channel.nack(msg, false, false);
      return;
    }
    const task = await this.runs.getTask(body.taskId).catch(() => null);
    if (!task || task.status === 'COMPLETED' || task.status === 'SKIPPED' || task.status === 'FAILED') {
      channel.ack(msg);
      return;
    }
    const startedAt = new Date();
    // A worker crash redelivers the same body, so trust recorded attempts over body.attempt.
    if (task.attempts >= MARKET_MAX_ATTEMPTS) {
      await this.runs.markDone(task.id, body.runId, 'FAILED', startedAt, { error: `Stopped after ${task.attempts} attempts` });
      channel.nack(msg, false, false);
      return;
    }
    try {
      await this.runs.markRunning(task.id, body.runId);
      const result = await handler(body);
      await this.runs.markDone(task.id, body.runId, result.status ?? 'COMPLETED', startedAt, {
        counters: result.counters,
        error: result.note,
      });
      channel.ack(msg);
    } catch (err) {
      const text = (err as Error).message || 'Market task failed';
      const retryable = !(err instanceof NonRetryableError);
      const attemptsUsed = Math.max(body.attempt, task.attempts + 1);
      if (retryable && attemptsUsed < MARKET_MAX_ATTEMPTS && this.rabbit.isReady()) {
        const delay = MARKET_RETRY_DELAYS_MS[Math.min(attemptsUsed - 1, MARKET_RETRY_DELAYS_MS.length - 1)];
        this.logger.warn(`Market task ${task.id} attempt ${attemptsUsed} failed, retry in ${delay}ms: ${text}`);
        await this.runs.markRetrying(task.id, text);
        this.rabbit.publish({ ...body, attempt: attemptsUsed + 1 }, delay);
        channel.ack(msg);
        return;
      }
      this.logger.warn(`Market task ${task.id} failed (${retryable ? 'attempts exhausted' : 'non-retryable'}): ${text}`);
      await this.runs.markDone(task.id, body.runId, 'FAILED', startedAt, { error: text }).catch(() => undefined);
      channel.nack(msg, false, false);
    }
  }
}
