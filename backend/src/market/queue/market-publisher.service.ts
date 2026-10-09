import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { MarketRunKind, MarketTrigger } from '../../prisma/client';
import { marketFlags } from '../market.flags';
import { MarketRunService, type NewTask } from '../runs/market-run.service';
import { MarketRabbitConnection } from './market-rabbit.connection';
import { MARKET_QUEUES, type MarketQueueName } from './market-queue.constants';

const QUEUE_FOR_KIND: Record<MarketRunKind, MarketQueueName> = {
  FETCH: MARKET_QUEUES.fetch,
  PROCESS: MARKET_QUEUES.process,
  AGGREGATE: MARKET_QUEUES.aggregate,
  RETENTION: MARKET_QUEUES.retention,
};

type TaskInput = NewTask & { payload?: Record<string, unknown> };

/** Creates a MarketRun with one MarketTask per message, then publishes. Every message carries its taskId. */
@Injectable()
export class MarketPublisher {
  constructor(
    private readonly rabbit: MarketRabbitConnection,
    private readonly runs: MarketRunService,
  ) {}

  /** Throws unless a run could be published now. Call before side effects that only make sense with a run. */
  assertCanRun() {
    if (!marketFlags.pipeline()) {
      throw new ConflictException({ error: 'MARKET_PIPELINE_DISABLED', message: 'Set MARKET_PIPELINE_ENABLED=true to run the market pipeline' });
    }
    if (!this.rabbit.isReady()) {
      throw new ServiceUnavailableException({ error: 'MARKET_QUEUE_UNAVAILABLE', message: 'Market queue is not connected' });
    }
  }

  async startRun(kind: MarketRunKind, trigger: MarketTrigger, items: TaskInput[], windowKey?: string) {
    this.assertCanRun();
    const { run, tasks } = await this.runs.createRun(kind, trigger, items, windowKey);
    if (!tasks.length) {
      await this.runs.refreshRun(run.id);
      return { runId: run.id, taskCount: 0 };
    }
    try {
      tasks.forEach((task, i) => {
        this.rabbit.publish({
          taskId: task.id,
          runId: run.id,
          queue: QUEUE_FOR_KIND[kind],
          attempt: 1,
          payload: { ...(items[i].payload ?? {}), sourceId: task.sourceId, careerId: task.careerId },
        });
      });
    } catch (err) {
      await this.runs.failRun(run.id, `Publish failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException({ error: 'MARKET_QUEUE_UNAVAILABLE', message: (err as Error).message });
    }
    return { runId: run.id, taskCount: tasks.length };
  }

  /** Called from a handler (worker) to continue the same run on another queue. */
  async enqueueFollowUp(runId: string, kind: MarketRunKind, task: TaskInput) {
    const created = await this.runs.addTask(runId, kind, task);
    try {
      this.rabbit.publish({
        taskId: created.id,
        runId,
        queue: QUEUE_FOR_KIND[kind],
        attempt: 1,
        payload: { ...(task.payload ?? {}), sourceId: created.sourceId, careerId: created.careerId },
      });
    } catch (err) {
      await this.runs.markDone(created.id, runId, 'FAILED', new Date(), { error: `Publish failed: ${(err as Error).message}` });
      throw err;
    }
    return created.id;
  }
}
