import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type Channel, type ChannelModel } from 'amqplib';
import { preferIpv4Loopback } from '../../common/loopback';
import { marketFlags } from '../market.flags';
import {
  ALL_MARKET_QUEUES,
  MARKET_DLX,
  MARKET_EXCHANGE,
  MARKET_RETRY_EXCHANGE,
  MARKET_RETRY_QUEUE,
  dlqName,
  type MarketMessage,
  type MarketQueueName,
} from './market-queue.constants';

type ReadyListener = (connection: ChannelModel) => void | Promise<void>;

/**
 * Market-only RabbitMQ connection. Separate from the career-ingest RabbitConnection, which is unchanged.
 * Connects only when MARKET_PIPELINE_ENABLED is on, reconnects with backoff, and isReady() reflects reality.
 */
@Injectable()
export class MarketRabbitConnection implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketRabbitConnection.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private ready = false;
  private stopping = false;
  private retryMs = 1000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly listeners: ReadyListener[] = [];

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (!marketFlags.pipeline()) return;
    if (!this.config.get<string>('RABBITMQ_URL')) {
      this.logger.warn('MARKET_PIPELINE_ENABLED but RABBITMQ_URL is not set — market queue disabled');
      return;
    }
    void this.connectLoop();
  }

  async onModuleDestroy() {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  isReady(): boolean {
    return this.ready && Boolean(this.channel);
  }

  /** Called on every (re)connect, so consumers re-subscribe after a broker restart. */
  onReady(listener: ReadyListener) {
    this.listeners.push(listener);
    if (this.isReady() && this.connection) void listener(this.connection);
  }

  publish(message: MarketMessage, delayMs = 0): boolean {
    if (!this.channel || !this.ready) throw new Error('Market queue is not connected');
    const body = Buffer.from(JSON.stringify(message));
    const options = { persistent: true, contentType: 'application/json', messageId: `${message.taskId}:${message.attempt}` };
    if (delayMs > 0) {
      return this.channel.publish(MARKET_RETRY_EXCHANGE, message.queue, body, { ...options, expiration: String(delayMs) });
    }
    return this.channel.publish(MARKET_EXCHANGE, message.queue, body, options);
  }

  knownQueue(name: string): boolean {
    return (
      (ALL_MARKET_QUEUES as string[]).includes(name) ||
      (ALL_MARKET_QUEUES as MarketQueueName[]).some((queue) => dlqName(queue) === name) ||
      name === MARKET_RETRY_QUEUE
    );
  }

  /** Reads up to `limit` messages and puts them back, so the admin view does not consume the queue. */
  async peek(queue: string, limit: number): Promise<Array<{ messageId: string | null; body: unknown; redelivered: boolean }>> {
    return this.withOpsChannel(async (channel) => {
      const held: Awaited<ReturnType<Channel['get']>>[] = [];
      const cap = Math.min(Math.max(limit, 1), 50);
      for (let i = 0; i < cap; i += 1) {
        const msg = await channel.get(queue, { noAck: false });
        if (!msg) break;
        held.push(msg);
      }
      const rows = held.map((msg) => {
        if (!msg) return { messageId: null, body: null, redelivered: false };
        let body: unknown = msg.content.toString();
        try {
          body = JSON.parse(msg.content.toString()) as unknown;
        } catch {
          body = msg.content.toString().slice(0, 500);
        }
        return { messageId: msg.properties.messageId ?? null, body, redelivered: msg.fields.redelivered };
      });
      for (let i = held.length - 1; i >= 0; i -= 1) {
        const msg = held[i];
        if (msg) channel.nack(msg, false, true);
      }
      return rows;
    });
  }

  /** Moves messages from a DLQ back onto the stage queue named in the message. */
  async requeue(queue: string, count: number): Promise<number> {
    return this.withOpsChannel(async (channel) => {
      let moved = 0;
      const cap = Math.min(Math.max(count, 1), 50);
      for (let i = 0; i < cap; i += 1) {
        const msg = await channel.get(queue, { noAck: false });
        if (!msg) break;
        let parsed: MarketMessage | null = null;
        try {
          parsed = JSON.parse(msg.content.toString()) as MarketMessage;
        } catch {
          parsed = null;
        }
        const target = parsed?.queue;
        if (!target || !(ALL_MARKET_QUEUES as string[]).includes(target)) {
          channel.nack(msg, false, true);
          break;
        }
        channel.publish(MARKET_EXCHANGE, target, msg.content, {
          persistent: true,
          contentType: 'application/json',
          messageId: msg.properties.messageId,
        });
        channel.ack(msg);
        moved += 1;
      }
      return moved;
    });
  }

  /** Acks messages so they leave the queue. Database task rows stay. */
  async drop(queue: string, count: number): Promise<number> {
    return this.withOpsChannel(async (channel) => {
      let dropped = 0;
      const cap = Math.min(Math.max(count, 1), 50);
      for (let i = 0; i < cap; i += 1) {
        const msg = await channel.get(queue, { noAck: false });
        if (!msg) break;
        channel.ack(msg);
        dropped += 1;
      }
      return dropped;
    });
  }

  private async withOpsChannel<T>(fn: (channel: Channel) => Promise<T>): Promise<T> {
    if (!this.connection || !this.ready) throw new Error('Market queue is not connected');
    const channel = await this.connection.createChannel();
    try {
      await assertMarketTopology(channel);
      return await fn(channel);
    } finally {
      await channel.close().catch(() => undefined);
    }
  }

  async queueDepths(): Promise<Array<{ queue: string; messages: number; consumers: number }>> {
    if (!this.connection || !this.ready) return [];
    const channel = await this.connection.createChannel();
    try {
      const names = [...ALL_MARKET_QUEUES, ...ALL_MARKET_QUEUES.map(dlqName), MARKET_RETRY_QUEUE];
      const out: Array<{ queue: string; messages: number; consumers: number }> = [];
      for (const queue of names) {
        const info = await channel.checkQueue(queue);
        out.push({ queue, messages: info.messageCount, consumers: info.consumerCount });
      }
      return out;
    } finally {
      await channel.close().catch(() => undefined);
    }
  }

  private async connectLoop() {
    if (this.stopping) return;
    try {
      const connection = await connect(preferIpv4Loopback(this.config.get<string>('RABBITMQ_URL')!));
      connection.on('error', (err) => {
        console.log("MARKET RABBITMQ ERROR", err);
        this.logger.warn(`Market RabbitMQ error: ${err.message}`)});
      connection.on('close', () => this.handleClose());
      const channel = await connection.createChannel();
      channel.on('close', () => this.handleClose());
      channel.on('error', (err) => this.logger.warn(`Market channel error: ${err.message}`));
      await assertMarketTopology(channel);
      this.connection = connection;
      this.channel = channel;
      this.ready = true;
      this.retryMs = 1000;
      this.logger.log('Market RabbitMQ connected');
      for (const listener of this.listeners) {
        await Promise.resolve(listener(connection)).catch((err: Error) => this.logger.warn(`Market ready listener failed: ${err.message}`));
      }
    } catch (err) {
      this.logger.warn(`Market RabbitMQ connect failed (retry in ${this.retryMs}ms): ${(err as Error).message}`);
      this.scheduleReconnect();
    }
  }

  private handleClose() {
    if (!this.ready && !this.connection) return;
    this.ready = false;
    this.channel = null;
    this.connection = null;
    if (!this.stopping) {
      this.logger.warn('Market RabbitMQ connection closed — reconnecting');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.stopping || this.reconnectTimer) return;
    const delay = this.retryMs;
    this.retryMs = Math.min(30_000, this.retryMs * 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectLoop();
    }, delay);
  }
}

/** market.pipeline (direct) -> one queue per stage; failures dead-letter to <queue>.dlq; delayed retries park in market.retry. */
export async function assertMarketTopology(channel: Channel) {
  await channel.assertExchange(MARKET_EXCHANGE, 'direct', { durable: true });
  await channel.assertExchange(MARKET_DLX, 'direct', { durable: true });
  await channel.assertExchange(MARKET_RETRY_EXCHANGE, 'direct', { durable: true });
  await channel.assertQueue(MARKET_RETRY_QUEUE, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': MARKET_EXCHANGE },
  });
  for (const queue of ALL_MARKET_QUEUES as MarketQueueName[]) {
    await channel.assertQueue(dlqName(queue), { durable: true });
    await channel.bindQueue(dlqName(queue), MARKET_DLX, queue);
    await channel.assertQueue(queue, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': MARKET_DLX, 'x-dead-letter-routing-key': queue },
    });
    await channel.bindQueue(queue, MARKET_EXCHANGE, queue);
    await channel.bindQueue(MARKET_RETRY_QUEUE, MARKET_RETRY_EXCHANGE, queue);
  }
}
