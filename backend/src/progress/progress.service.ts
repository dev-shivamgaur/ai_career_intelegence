import { Injectable } from '@nestjs/common';
import { Prisma } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProgressEventDto } from './dto/progress.dto';
import { RoadmapCorpusService } from '../web/roadmap-corpus.service';
import { TaskStatus } from '../prisma/client';

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly corpus: RoadmapCorpusService,
  ) {}

  async get(userId: string) {
    const snapshot = await this.rebuild(userId);
    const events = await this.prisma.progressEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { snapshot, recentEvents: events };
  }

  async rebuild(userId: string) {
    const learning = await this.corpus.learningProgress(userId);
    const roadmap = await this.prisma.roadmap.findFirst({
      where: { userId },
      include: { tasks: true },
      orderBy: { createdAt: 'desc' },
    });
    const done = roadmap?.tasks.filter((t) => t.status === TaskStatus.COMPLETED).length ?? 0;
    const totalTasks = roadmap?.tasks.length ?? 0;
    const roadmapPercent = totalTasks ? Math.round((done / totalTasks) * 100) : learning.percent;
    const gaps = await this.prisma.skillGap.count({ where: { userId } });
    const strong = await this.prisma.userSkill.count({
      where: { profile: { userId }, proficiency: { gte: 55 } },
    });
    const projects = await this.prisma.project.count({ where: { profile: { userId } } });

    const month = new Date().toISOString().slice(0, 7);
    const events = await this.prisma.progressEvent.findMany({
      where: { userId, type: 'SKILL_PRACTICE' },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const byMonth = new Map<string, number>();
    let running = 0;
    for (const e of events) {
      running += 1;
      const m = e.createdAt.toISOString().slice(0, 7);
      byMonth.set(m, running);
    }
    if (!byMonth.size) byMonth.set(month, learning.known);
    const skillProgressOverTime = [...byMonth.entries()].map(([m, skills]) => ({ month: m, skills }));
    const roadmapPoint = { month, percent: roadmapPercent };

    const payload = {
      skillsCompleted: learning.known,
      skillsTotal: learning.total || gaps || 1,
      roadmapPercent,
      learningHours: done * 4,
      projectsCompleted: projects,
      applications: 0,
      interviewPrepPercent: Math.min(100, strong * 10),
      skillProgressOverTime: skillProgressOverTime as unknown as Prisma.InputJsonValue,
      roadmapCompletionOverTime: [roadmapPoint] as unknown as Prisma.InputJsonValue,
      applicationsOverTime: [{ month, count: 0 }] as unknown as Prisma.InputJsonValue,
    };

    const existing = await this.prisma.progressSnapshot.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return this.prisma.progressSnapshot.update({ where: { id: existing.id }, data: payload });
    }
    return this.prisma.progressSnapshot.create({ data: { userId, ...payload } });
  }

  async addEvent(userId: string, dto: CreateProgressEventDto) {
    const event = await this.prisma.progressEvent.create({
      data: {
        userId,
        type: dto.type,
        payload: (dto.payload as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
    return event;
  }
}
