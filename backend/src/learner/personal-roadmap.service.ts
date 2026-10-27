import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReadinessService } from './readiness.service';

@Injectable()
export class PersonalRoadmapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readiness: ReadinessService,
  ) {}

  async current(userId: string) {
    return this.prisma.personalizedRoadmap.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { tasks: { orderBy: { sortOrder: 'asc' } }, career: { select: { title: true, slug: true } } },
    });
  }

  /** Builds a side plan. Does not write Roadmap or SkillGap. */
  async generate(userId: string) {
    const view = await this.readiness.forUser(userId);
    const foundationTasks = view.foundations.map((skill) => ({
      skillId: skill.skillId,
      title: skill.name,
      why: `${skill.name} is a syllabus prerequisite. The plan starts with the syllabus, then adds market skills by demand.`,
      foundational: true,
    }));
    const gapTasks = view.gaps.map((gap) => ({
      skillId: gap.skillId,
      title: gap.blocked ? `First: prerequisite for ${gap.name}` : gap.name,
      why: gap.blocked
        ? `${gap.name} waits on a syllabus prerequisite. After the syllabus, market skills are ordered by demand.`
        : `${gap.name} is on the syllabus as ${gap.type}. Market skills from monitored job posts come after the syllabus, ordered by demand.`,
      foundational: gap.blocked || gap.type === 'REQUIRED' || gap.importance === 'HIGH',
    }));
    const tasks = [...foundationTasks, ...gapTasks].map((task, index) => ({ ...task, sortOrder: index }));
    await this.prisma.personalizedRoadmap.deleteMany({ where: { userId } });
    return this.prisma.personalizedRoadmap.create({
      data: {
        userId,
        careerId: view.career.id,
        title: `${view.career.title} — personal order`,
        tasks: { create: tasks },
      },
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  /** Appends tasks onto the existing roadmap. Does not delete or reorder tasks already there. */
  async apply(userId: string) {
    const plan = await this.current(userId);
    if (!plan) throw new NotFoundException({ error: 'PLAN_NOT_FOUND', message: 'Generate a personal plan first' });
    const goal = await this.prisma.careerGoal.findFirst({ where: { userId, isActive: true }, include: { career: true } });
    if (!goal) throw new NotFoundException({ error: 'GOAL_NOT_FOUND', message: 'Active career goal required' });
    let roadmap = await this.prisma.roadmap.findFirst({ where: { userId, careerId: goal.careerId }, include: { tasks: true } });
    if (!roadmap) {
      roadmap = await this.prisma.roadmap.create({
        data: { userId, careerId: goal.careerId, title: goal.career.title, tasks: { create: [] } },
        include: { tasks: true },
      });
    }
    const start = roadmap.tasks.reduce((max, task) => Math.max(max, task.sortOrder), 0) + 1;
    await this.prisma.roadmapTask.createMany({
      data: plan.tasks.map((task, index) => ({
        roadmapId: roadmap!.id,
        title: task.title,
        description: 'Added from the optional personal plan.',
        why: task.why,
        relatedSkill: task.title,
        sortOrder: start + index,
        phase: 'D30' as const,
      })),
    });
    return { added: plan.tasks.length, roadmapId: roadmap.id };
  }
}
