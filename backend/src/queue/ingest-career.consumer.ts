import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Channel, ConsumeMessage } from 'amqplib';
import { IngestJobStatus } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FieldIngestAgent } from '../admin/field-ingest.agent';
import {
  INGEST_DLX,
  INGEST_MAX_ATTEMPTS,
  INGEST_QUEUE,
  INGEST_ROUTING,
  type IngestQueueMessage,
} from './ingest-queue.constants';
import { IngestEnqueueService } from './ingest-enqueue.service';
import { IngestRunService } from './ingest-run.service';
import { RabbitConnection } from './rabbit.connection';

/**
 * Runs only when INGEST_WORKER=1 (the worker process). The API process publishes jobs and does not consume them.
 */
@Injectable()
export class IngestCareerConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(IngestCareerConsumer.name);

  constructor(
    private readonly config: ConfigService,
    private readonly rabbit: RabbitConnection,
    private readonly prisma: PrismaService,
    private readonly agent: FieldIngestAgent,
    private readonly runs: IngestRunService,
    private readonly enqueue: IngestEnqueueService,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.INGEST_WORKER !== '1') return;
    if (!this.rabbit.isReady()) {
      this.logger.warn('Ingest worker did not start — RabbitMQ is not connected');
      return;
    }
    const channel = await this.rabbit.openConsumerChannel();
    const concurrency = Math.max(1, Number(this.config.get<string>('INGEST_WORKER_CONCURRENCY') || 3));
    await channel.prefetch(concurrency);
    await channel.consume(INGEST_QUEUE, (message) => {
      if (message) void this.handle(channel, message);
    });
    this.logger.log(`Ingest worker listening (prefetch ${concurrency})`);
  }

  private async handle(channel: Channel, message: ConsumeMessage) {
    let body: IngestQueueMessage;
    try {
      body = JSON.parse(message.content.toString()) as IngestQueueMessage;
    } catch {
      channel.ack(message);
      return;
    }

    const existing = await this.prisma.ingestCareerJob.findUnique({ where: { id: body.jobId } });
    if (!existing || existing.status === IngestJobStatus.COMPLETED || existing.status === IngestJobStatus.FAILED) {
      channel.ack(message);
      return;
    }

    const startedAt = new Date();

    // A worker crash redelivers the same message body, so count recorded attempts instead of trusting body.attempt.
    const attemptsSoFar = await this.prisma.ingestJobStep.count({
      where: { jobId: body.jobId, stepKey: 'load_career' },
    });
    if (attemptsSoFar >= INGEST_MAX_ATTEMPTS) {
      const text = `Stopped after ${attemptsSoFar} attempts (worker restarted mid-job)`;
      this.logger.warn(`Ingest job ${body.jobId}: ${text}`);
      await this.runs.markFailed(body.jobId, body.runId, text, startedAt);
      channel.publish(INGEST_DLX, INGEST_ROUTING, message.content, { persistent: true, contentType: 'application/json' });
      channel.ack(message);
      return;
    }

    try {
      await this.runs.markRunning(body.jobId, body.runId);
      const result = await this.agent.ingestCareer(body.careerId, { jobId: body.jobId });
      await this.runs.markCompleted(body.jobId, body.runId, result, startedAt);
      channel.ack(message);
      this.logger.log(`Ingest job ${body.jobId} completed (${result.slug}, +${result.added.length})`);
    } catch (err) {
      const text = (err as Error).message || 'Ingest failed';
      if (body.attempt < INGEST_MAX_ATTEMPTS && attemptsSoFar + 1 < INGEST_MAX_ATTEMPTS) {
        const delay = 1000 * 2 ** (body.attempt - 1);
        this.logger.warn(`Ingest job ${body.jobId} attempt ${body.attempt} failed, retry in ${delay}ms: ${text}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        this.enqueue.publish({ ...body, attempt: body.attempt + 1 });
        channel.ack(message);
        return;
      }
      this.logger.warn(`Ingest job ${body.jobId} failed after ${body.attempt} attempts: ${text}`);
      await this.runs.markFailed(body.jobId, body.runId, text, startedAt);
      channel.publish(INGEST_DLX, INGEST_ROUTING, message.content, {
        persistent: true,
        contentType: 'application/json',
      });
      channel.ack(message);
    }
  }
}
