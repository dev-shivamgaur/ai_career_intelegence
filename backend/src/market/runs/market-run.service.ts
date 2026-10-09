import { Injectable } from '@nestjs/common';
import {
  MarketRunKind,
  MarketRunStatus,
  MarketTaskStatus,
  MarketTrigger,
  Prisma,
  type MarketTask,
} from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type NewTask = { sourceId?: string | null; careerId?: string | null };

@Injectable()
export class MarketRunService {
  constructor(private readonly prisma: PrismaService) {}

  async createRun(kind: MarketRunKind, trigger: MarketTrigger, tasks: NewTask[], windowKey?: string) {
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.marketRun.create({
        data: { kind, trigger, windowKey: windowKey ?? null, totalTasks: tasks.length, status: MarketRunStatus.QUEUED },
      });
      const created: MarketTask[] = [];
      for (const t of tasks) {
        created.push(
          await tx.marketTask.create({
            data: { runId: run.id, kind, sourceId: t.sourceId ?? null, careerId: t.careerId ?? null },
          }),
        );
      }
      return { run, tasks: created };
    });
  }

  getTask(taskId: string) {
    return this.prisma.marketTask.findUnique({ where: { id: taskId } });
  }

  async markRunning(taskId: string, runId: string) {
    const now = new Date();
    await this.prisma.marketTask.update({
      where: { id: taskId },
      data: { status: MarketTaskStatus.RUNNING, startedAt: now, attempts: { increment: 1 }, error: null },
    });
    await this.prisma.marketRun.updateMany({
      where: { id: runId, startedAt: null },
      data: { startedAt: now },
    });
    await this.prisma.marketRun.updateMany({
      where: { id: runId, status: MarketRunStatus.QUEUED },
      data: { status: MarketRunStatus.RUNNING },
    });
  }

  async markDone(
    taskId: string,
    runId: string,
    status: 'COMPLETED' | 'FAILED' | 'SKIPPED',
    startedAt: Date,
    extra: { counters?: Record<string, unknown>; error?: string } = {},
  ) {
    const finishedAt = new Date();
    await this.prisma.marketTask.update({
      where: { id: taskId },
      data: {
        status: MarketTaskStatus[status],
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        error: extra.error ? extra.error.slice(0, 2000) : null,
        counters: (extra.counters ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    await this.refreshRun(runId);
  }

  async markRetrying(taskId: string, error: string) {
    await this.prisma.marketTask.update({
      where: { id: taskId },
      data: { status: MarketTaskStatus.QUEUED, error: `retrying: ${error}`.slice(0, 2000) },
    });
  }

  /** Recomputes run status and sums numeric task counters into run.counters. */
  async refreshRun(runId: string) {
    const tasks = await this.prisma.marketTask.findMany({ where: { runId }, select: { status: true, counters: true } });
    const completed = tasks.filter((t) => t.status === MarketTaskStatus.COMPLETED || t.status === MarketTaskStatus.SKIPPED).length;
    const failed = tasks.filter((t) => t.status === MarketTaskStatus.FAILED).length;
    const open = tasks.some((t) => t.status === MarketTaskStatus.QUEUED || t.status === MarketTaskStatus.RUNNING);
    let status: MarketRunStatus = MarketRunStatus.RUNNING;
    if (!open) {
      if (failed === 0) status = MarketRunStatus.COMPLETED;
      else if (completed === 0) status = MarketRunStatus.FAILED;
      else status = MarketRunStatus.PARTIAL_FAILED;
    }
    const counters: Record<string, number> = {};
    for (const t of tasks) {
      if (!t.counters || typeof t.counters !== 'object') continue;
      for (const [k, v] of Object.entries(t.counters as Record<string, unknown>)) {
        if (typeof v === 'number') counters[k] = (counters[k] ?? 0) + v;
      }
    }
    await this.prisma.marketRun.update({
      where: { id: runId },
      data: {
        status,
        completedTasks: completed,
        failedTasks: failed,
        counters: counters as Prisma.InputJsonValue,
        finishedAt: open ? null : new Date(),
      },
    });
  }

  async failRun(runId: string, error: string) {
    await this.prisma.marketTask.updateMany({
      where: { runId, status: MarketTaskStatus.QUEUED },
      data: { status: MarketTaskStatus.FAILED, error, finishedAt: new Date() },
    });
    await this.refreshRun(runId);
  }

  listRuns(kind?: MarketRunKind, take = 30) {
    return this.prisma.marketRun.findMany({
      where: kind ? { kind } : {},
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  getRun(runId: string) {
    return this.prisma.marketRun.findUnique({
      where: { id: runId },
      include: {
        tasks: {
          orderBy: { createdAt: 'asc' },
          include: { source: { select: { id: true, type: true, boardToken: true, company: { select: { name: true } } } } },
        },
      },
    });
  }
}
