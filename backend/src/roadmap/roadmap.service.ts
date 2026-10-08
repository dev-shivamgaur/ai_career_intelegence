import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateRoadmapTaskDto } from './dto/roadmap.dto';
import { RoadmapCorpusService } from '../web/roadmap-corpus.service';
import { EvidenceService } from '../ai/evidence.service';
import { SkillGapService } from '../skill-gap/skill-gap.service';
import { LlmService } from '../ai/llm.service';
import { tierPathCopy } from '../ai/learner-tier';
import { scoreAnswers } from '../ai/lesson-check';
import { TaskStatus } from '../prisma/client';

@Injectable()
export class RoadmapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly corpus: RoadmapCorpusService,
    private readonly evidence: EvidenceService,
    private readonly skillGaps: SkillGapService,
    private readonly llm: LlmService,
  ) {}

  async get(userId: string, phase?: string) {
    let roadmap = await this.prisma.roadmap.findFirst({
      where: { userId },
      include: { tasks: { orderBy: { sortOrder: 'asc' } }, career: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!roadmap) {
      const goal = await this.prisma.careerGoal.findFirst({
        where: { userId, isActive: true },
        include: { career: true },
      });
      if (goal) {
        await this.corpus.ensureUserRoadmap(userId);
        roadmap = await this.prisma.roadmap.findFirst({
          where: { userId },
          include: { tasks: { orderBy: { sortOrder: 'asc' } }, career: true },
          orderBy: { createdAt: 'desc' },
        });
      }
    }
    if (!roadmap) {
      throw new NotFoundException({ error: 'ROADMAP_NOT_FOUND', message: 'No roadmap yet' });
    }
    const counts = { '7d': 0, '30d': 0, '60d': 0, '90d': 0, '180d': 0 };
    for (const task of roadmap.tasks) {
      const key = this.phaseKey(task.phase);
      counts[key] += 1;
    }
    if (counts['30d'] === 0 && counts['60d'] + counts['90d'] + counts['180d'] > 0) {
      await this.corpus.rebuildUserRoadmap(userId);
      const rebuilt = await this.prisma.roadmap.findFirst({
        where: { userId },
        include: { tasks: { orderBy: { sortOrder: 'asc' } }, career: true },
        orderBy: { createdAt: 'desc' },
      });
      if (rebuilt) roadmap = rebuilt;
    }
    return this.present(userId, roadmap, phase);
  }

  private async present(
    userId: string,
    roadmap: {
      id: string;
      title: string;
      career: { title: string };
      tasks: Array<{ id: string; title: string; phase: string; status: TaskStatus }>;
    },
    phase?: string,
  ) {
    const progress = await this.corpus.learningProgress(userId);
    const ev = await this.evidence.forUser(userId);
    const path = tierPathCopy(ev.learnerTier);
    const optional = ev.careerSlug
      ? (await this.corpus.optionalTopics(ev.careerSlug, ev.stack)).map((t) => t.title).slice(0, 8)
      : [];
    const counts = { '7d': 0, '30d': 0, '60d': 0, '90d': 0, '180d': 0 };
    let completed = 0;
    for (const task of roadmap.tasks) {
      const key = this.phaseKey(task.phase);
      counts[key] += 1;
      if (task.status === TaskStatus.COMPLETED) completed += 1;
    }
    const selected = phase ? this.phaseKey(phase) : '7d';
    const tasks = roadmap.tasks.filter((task) => this.phaseKey(task.phase) === selected);
    const total = roadmap.tasks.length;
    return {
      id: roadmap.id,
      careerTitle: roadmap.career.title,
      title: roadmap.title,
      syllabusPercent: progress.percent,
      syllabusKnown: progress.known,
      syllabusTotal: progress.total,
      stackLabel: ev.stackLabel,
      seniority: ev.seniority,
      learnerTier: ev.learnerTier,
      roleSkillMatchPercent: ev.roleSkillMatchPercent,
      pathLabel: path.pathLabel,
      pathDetail: path.pathDetail,
      studyNext: tasks.map((task) => task.title),
      optional,
      alternatives: ev.family.lanes.filter((l) => l.id !== ev.stack).map((l) => l.label),
      unlockedPhases: ['7d', '30d', '60d', '90d', '180d'],
      phaseCounts: counts,
      preparation: {
        completed,
        total,
        percent: total ? Math.round((completed / total) * 100) : 0,
      },
      tasks,
    };
  }

  private phaseKey(phase: string): '7d' | '30d' | '60d' | '90d' | '180d' {
    const p = phase.toUpperCase().replace(/[^0-9]/g, '');
    if (p === '7') return '7d';
    if (p === '60') return '60d';
    if (p === '90') return '90d';
    if (p === '180') return '180d';
    if (p === '30') return '30d';
    return '30d';
  }

  async generate(userId: string) {
    const goal = await this.prisma.careerGoal.findFirst({
      where: { userId, isActive: true },
      include: { career: true },
    });
    if (!goal) {
      throw new NotFoundException({
        error: 'GOAL_NOT_FOUND',
        message: 'Active career goal required',
      });
    }

    await this.corpus.syncCareer(goal.career.slug);
    await this.prisma.roadmap.deleteMany({ where: { userId } });
    await this.corpus.ensureUserRoadmap(userId);
    return this.get(userId);
  }

  async updateTask(userId: string, taskId: string, dto: UpdateRoadmapTaskDto) {
    const task = await this.prisma.roadmapTask.findFirst({
      where: { id: taskId, roadmap: { userId } },
    });
    if (!task) {
      throw new NotFoundException({ error: 'TASK_NOT_FOUND', message: 'Task not found' });
    }
    await this.prisma.roadmapTask.update({
      where: { id: taskId },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
    });
    if (dto.status === TaskStatus.COMPLETED) {
      await this.skillGaps.applySkillPractice(userId, task.relatedSkill ?? task.title);
      await this.skillGaps.safeRecalculate(userId);
    }
    return this.get(userId);
  }

  async checkTask(userId: string, taskId: string, answer: string, phase?: string) {
    const task = await this.prisma.roadmapTask.findFirst({
      where: { id: taskId, roadmap: { userId } },
    });
    if (!task) {
      throw new NotFoundException({ error: 'TASK_NOT_FOUND', message: 'Task not found' });
    }
    const topic = (task.relatedSkill || task.title).trim();
    const text = answer.trim();
    const ev = await this.evidence.forUser(userId);
    const place = ev.stackLabel || 'Backend';
    const judged = await this.judgeAnswer(topic, place, text);
    if (judged.passed) {
      await this.prisma.roadmapTask.update({
        where: { id: taskId },
        data: { status: TaskStatus.COMPLETED, note: text.slice(0, 500) },
      });
      await this.skillGaps.applySkillPractice(userId, topic, undefined, text.slice(0, 500), judged.score >= 85 ? 22 : 15, true);
      await this.skillGaps.safeRecalculate(userId);
    }
    const roadmap = await this.get(userId, phase);
    return { check: judged, roadmap };
  }

  private async judgeAnswer(topic: string, place: string, text: string) {
    if (text.length < 40) {
      return {
        score: 0,
        passed: false,
        proficiency: 'beginner' as const,
        accuracy: 'Too short to judge',
        feedback: `Write how a ${place} developer uses ${topic}: what goes in, what can go wrong, and how you would check it. Repeating the topic name is not an answer.`,
      };
    }
    const local = scoreAnswers(
      topic,
      [{ id: 'a', prompt: `Use ${topic} in ${place} work.`, rubric: 'Specific work, not a definition.' }],
      [{ id: 'a', text }],
    );
    let score = local.score;
    let feedback = local.feedback;
    let proficiency: 'beginner' | 'working' | 'professional' =
      score >= 85 ? 'professional' : score >= 70 ? 'working' : 'beginner';
    let accuracy =
      score >= 85 ? 'Accurate for a working developer' : score >= 70 ? 'Mostly accurate' : 'Missing the practical point';
    if (this.llm.isConfigured()) {
      try {
        const raw = await this.llm.complete(
          [
            {
              role: 'system',
              content:
                'You grade one backend-skill answer against what a hiring manager expects from a working developer. Pass only when the answer is specific and mostly correct. A definition that repeats the topic name fails. JSON only: {"score":number,"proficiency":"beginner"|"working"|"professional","accuracy":string,"feedback":string}. score 0-100. 70 or more means the answer is actually right for the market bar.',
            },
            {
              role: 'user',
              content: `Stack: ${place}. Topic: ${topic}. Answer: ${text}`,
            },
          ],
          { temperature: 0.1 },
        );
        const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as {
          score?: number;
          feedback?: string;
          proficiency?: string;
          accuracy?: string;
        };
        if (typeof parsed.score === 'number' && Number.isFinite(parsed.score)) {
          score = Math.max(0, Math.min(100, Math.round(parsed.score)));
        }
        if (parsed.feedback?.trim()) feedback = parsed.feedback.trim();
        if (parsed.proficiency === 'beginner' || parsed.proficiency === 'working' || parsed.proficiency === 'professional') {
          proficiency = parsed.proficiency;
        } else {
          proficiency = score >= 85 ? 'professional' : score >= 70 ? 'working' : 'beginner';
        }
        if (parsed.accuracy?.trim()) accuracy = parsed.accuracy.trim();
      } catch {
        feedback = local.feedback;
      }
    }
    return { score, passed: score >= 70, proficiency, accuracy, feedback };
  }
}
