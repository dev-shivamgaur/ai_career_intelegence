import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type Channel, type ChannelModel } from 'amqplib';
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
      const connection = await connect(this.config.get<string>('RABBITMQ_URL')!);
      connection.on('error', (err) => this.logger.warn(`Market RabbitMQ error: ${err.message}`));
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
