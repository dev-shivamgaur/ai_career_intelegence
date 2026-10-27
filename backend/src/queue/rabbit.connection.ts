import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type Channel, type ChannelModel } from 'amqplib';
import { preferIpv4Loopback } from '../common/loopback';
import {
  INGEST_DLQ,
  INGEST_DLX,
  INGEST_EXCHANGE,
  INGEST_QUEUE,
  INGEST_ROUTING,
} from './ingest-queue.constants';

@Injectable()
export class RabbitConnection implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitConnection.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('RABBITMQ_URL');
    console.log("Rabbitmqurl",url);
  }

  async onModuleInit() {
    const url = this.config.get<string>('RABBITMQ_URL');
    console.log("Rabbitmqurl",url);
    if (!url) {
      this.logger.warn('RABBITMQ_URL is not set — career ingest jobs cannot be published');
      return;
    }
    try {
      this.connection = await connect(preferIpv4Loopback(url));
      this.connection.on('error', (err) => {
        console.log("RabbitMQ connection error")
        this.logger.warn(`RabbitMQ connection error: ${err.message}`)});
      this.channel = await this.connection.createChannel();
      await this.assertTopology(this.channel);
      console.log("RabbitMQ connection created");
      this.logger.log('RabbitMQ connected');
    } catch (err) {
      this.logger.warn(`RabbitMQ connect failed: ${(err as Error).message}`);
      this.connection = null;
      this.channel = null;
    }
  }

  async onModuleDestroy() {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  isReady(): boolean {
    return Boolean(this.channel);
  }

  publisher(): Channel {
    if (!this.channel) {
      throw new Error('RabbitMQ is not connected. Set RABBITMQ_URL and start the broker.');
    }
    return this.channel;
  }

  async openConsumerChannel(): Promise<Channel> {
    if (!this.connection) {
      throw new Error('RabbitMQ is not connected. Set RABBITMQ_URL and start the broker.');
    }
    const channel = await this.connection.createChannel();
    await this.assertTopology(channel);
    return channel;
  }

  private async assertTopology(channel: Channel) {
    await channel.assertExchange(INGEST_EXCHANGE, 'direct', { durable: true });
    await channel.assertExchange(INGEST_DLX, 'direct', { durable: true });
    await channel.assertQueue(INGEST_DLQ, { durable: true });
    await channel.bindQueue(INGEST_DLQ, INGEST_DLX, INGEST_ROUTING);
    await channel.assertQueue(INGEST_QUEUE, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': INGEST_DLX,
        'x-dead-letter-routing-key': INGEST_ROUTING,
      },
    });
    await channel.bindQueue(INGEST_QUEUE, INGEST_EXCHANGE, INGEST_ROUTING);
  }
}
