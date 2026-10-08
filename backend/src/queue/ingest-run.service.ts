import { Injectable } from '@nestjs/common';
import { IngestJobStatus, IngestRunStatus, Prisma } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { IngestResult } from '../admin/field-ingest.agent';

@Injectable()
export class IngestRunService {
  constructor(private readonly prisma: PrismaService) {}

  async markRunning(jobId: string, runId: string) {
    const now = new Date();
    await this.prisma.ingestCareerJob.update({
      where: { id: jobId },
      data: { status: IngestJobStatus.RUNNING, startedAt: now, error: null },
    });
    await this.prisma.ingestRun.updateMany({
      where: { id: runId, startedAt: null },
      data: { status: IngestRunStatus.RUNNING, startedAt: now },
    });
    await this.prisma.ingestRun.update({
      where: { id: runId },
      data: { status: IngestRunStatus.RUNNING },
    });
  }

  async markCompleted(jobId: string, runId: string, result: IngestResult, startedAt: Date) {
    const finishedAt = new Date();
    await this.prisma.ingestCareerJob.update({
      where: { id: jobId },
      data: {
        status: IngestJobStatus.COMPLETED,
        result: result as unknown as Prisma.InputJsonValue,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        error: null,
      },
    });
    await this.refreshRun(runId);
  }

  async markFailed(jobId: string, runId: string, error: string, startedAt: Date) {
    const finishedAt = new Date();
    await this.prisma.ingestCareerJob.update({
      where: { id: jobId },
      data: {
        status: IngestJobStatus.FAILED,
        error: error.slice(0, 2000),
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      },
    });
    await this.refreshRun(runId);
  }

  async refreshRun(runId: string) {
    const jobs = await this.prisma.ingestCareerJob.findMany({
      where: { runId },
      select: { status: true },
    });
    const completedJobs = jobs.filter((job) => job.status === IngestJobStatus.COMPLETED).length;
    const failedJobs = jobs.filter((job) => job.status === IngestJobStatus.FAILED).length;
    const open = jobs.some(
      (job) => job.status === IngestJobStatus.QUEUED || job.status === IngestJobStatus.RUNNING,
    );
    let status: IngestRunStatus = IngestRunStatus.RUNNING;
    if (!open) {
      if (failedJobs === 0) status = IngestRunStatus.COMPLETED;
      else if (completedJobs === 0) status = IngestRunStatus.FAILED;
      else status = IngestRunStatus.PARTIAL_FAILED;
    }
    await this.prisma.ingestRun.update({
      where: { id: runId },
      data: {
        status,
        completedJobs,
        failedJobs,
        finishedAt: open ? null : new Date(),
      },
    });
  }

  listRuns(take = 20) {
    return this.prisma.ingestRun.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: { _count: { select: { jobs: true } } },
    });
  }

  getRun(runId: string) {
    return this.prisma.ingestRun.findUnique({
      where: { id: runId },
      include: {
        jobs: {
          orderBy: { createdAt: 'asc' },
          include: {
            career: { select: { id: true, slug: true, title: true } },
            steps: { orderBy: { startedAt: 'asc' } },
          },
        },
      },
    });
  }
}
