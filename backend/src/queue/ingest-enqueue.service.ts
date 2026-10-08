import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { IngestTrigger } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  INGEST_EXCHANGE,
  INGEST_ROUTING,
  type IngestQueueMessage,
  type IngestTriggerName,
} from './ingest-queue.constants';
import { RabbitConnection } from './rabbit.connection';

@Injectable()
export class IngestEnqueueService {
  private readonly logger = new Logger(IngestEnqueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitConnection,
  ) {}

  async startRun(trigger: IngestTriggerName) {
    this.assertBrokerReady();
    const careers = await this.prisma.career.findMany({
      where: { isCustom: false },
      select: { id: true },
    });
    const run = await this.prisma.ingestRun.create({
      data: {
        trigger: trigger as IngestTrigger,
        totalJobs: careers.length,
      },
    });
    for (const career of careers) {
      const job = await this.prisma.ingestCareerJob.create({
        data: { runId: run.id, careerId: career.id },
      });
      this.publish({
        runId: run.id,
        jobId: job.id,
        careerId: career.id,
        trigger,
        attempt: 1,
      });
    }
    this.logger.log(`Enqueued ingest run ${run.id}: ${careers.length} careers (${trigger})`);
    return { runId: run.id, jobCount: careers.length, status: 'queued' as const };
  }

  async enqueueSingleCareer(careerId: string, trigger: IngestTriggerName) {
    this.assertBrokerReady();
    const career = await this.prisma.career.findFirst({
      where: { OR: [{ id: careerId }, { slug: careerId }] },
      select: { id: true },
    });
    if (!career) {
      return { runId: null, jobId: null, jobCount: 0, status: 'skipped' as const, note: 'Career not found' };
    }
    const run = await this.prisma.ingestRun.create({
      data: { trigger: trigger as IngestTrigger, totalJobs: 1 },
    });
    const job = await this.prisma.ingestCareerJob.create({
      data: { runId: run.id, careerId: career.id },
    });
    this.publish({
      runId: run.id,
      jobId: job.id,
      careerId: career.id,
      trigger,
      attempt: 1,
    });
    this.logger.log(`Enqueued career ${career.id} as job ${job.id} (${trigger})`);
    return { runId: run.id, jobId: job.id, jobCount: 1, status: 'queued' as const };
  }

  publish(message: IngestQueueMessage) {
    const channel = this.rabbit.publisher();
    channel.publish(INGEST_EXCHANGE, INGEST_ROUTING, Buffer.from(JSON.stringify(message)), {
      persistent: true,
      contentType: 'application/json',
      messageId: `${message.jobId}:${message.attempt}`,
    });
  }

  /** Checked before any rows are written, so a missing broker never leaves QUEUED jobs that nothing will consume. */
  private assertBrokerReady() {
    if (!this.rabbit.isReady()) {
      throw new ServiceUnavailableException({
        error: 'INGEST_QUEUE_UNAVAILABLE',
        message: 'RabbitMQ is not connected. Start the broker and set RABBITMQ_URL.',
      });
    }
  }
}
