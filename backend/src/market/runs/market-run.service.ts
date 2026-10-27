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

  /** Adds a follow-up task (e.g. PROCESS after FETCH) to an existing run so the run tracks the whole batch. */
  async addTask(runId: string, kind: MarketRunKind, task: NewTask) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.marketTask.create({
        data: { runId, kind, sourceId: task.sourceId ?? null, careerId: task.careerId ?? null },
      });
      await tx.marketRun.update({
        where: { id: runId },
        data: { totalTasks: { increment: 1 }, status: MarketRunStatus.RUNNING, finishedAt: null },
      });
      return created;
    });
  }

  findRunInWindow(windowKey: string) {
    return this.prisma.marketRun.findFirst({ where: { windowKey }, select: { id: true } });
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

  listRuns(kind?: MarketRunKind, take = 20, skip = 0) {
    const where = kind ? { kind } : {};
    return Promise.all([
      this.prisma.marketRun.count({ where }),
      this.prisma.marketRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
    ]).then(([total, items]) => ({ total, skip, take, items }));
  }

  listTasks(params: { status?: MarketTaskStatus; kind?: MarketRunKind; skip?: number; take?: number }) {
    const take = Math.min(Math.max(params.take ?? 20, 1), 100);
    const skip = Math.max(params.skip ?? 0, 0);
    const where: Prisma.MarketTaskWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.kind) where.kind = params.kind;
    return Promise.all([
      this.prisma.marketTask.count({ where }),
      this.prisma.marketTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          run: { select: { id: true, kind: true, status: true, trigger: true } },
          source: { select: { id: true, type: true, boardToken: true, company: { select: { name: true } } } },
        },
      }),
    ]).then(([total, items]) => ({ total, skip, take, items }));
  }

  /** Failed tasks must be QUEUED again before their message is replayed, or the worker drops them. */
  async reopenFailed(taskIds: string[]) {
    const ids = [...new Set(taskIds.filter(Boolean))];
    if (!ids.length) return { reopened: 0 };
    const rows = await this.prisma.marketTask.findMany({ where: { id: { in: ids }, status: MarketTaskStatus.FAILED }, select: { id: true, runId: true } });
    if (!rows.length) return { reopened: 0 };
    await this.prisma.marketTask.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: { status: MarketTaskStatus.QUEUED, error: null, finishedAt: null },
    });
    for (const runId of new Set(rows.map((row) => row.runId))) await this.refreshRun(runId);
    return { reopened: rows.length };
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
