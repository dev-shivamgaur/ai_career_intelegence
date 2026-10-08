import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgentService } from '../ai/agent.service';
import { RecommendationService } from '../ai/recommendation.service';
import { RoadmapCorpusService } from '../web/roadmap-corpus.service';
import { FitScoreService } from '../ai/fit-score.service';
import { EvidenceService } from '../ai/evidence.service';
import { SarkariJudgeService } from '../sarkari/sarkari-judge.service';
import { parseLanes } from '../ai/stack-lanes';
import { CreateCareerGoalDto, UpdateCareerGoalDto } from './dto/career.dto';

@Injectable()
export class CareersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: AgentService,
    private readonly recommendations: RecommendationService,
    private readonly corpus: RoadmapCorpusService,
    private readonly fit: FitScoreService,
    private readonly evidence: EvidenceService,
    private readonly sarkariJudge: SarkariJudgeService,
  ) {}

  async listCareers() {
    const rows = await this.prisma.career.findMany({
      where: { isCustom: false },
      select: { id: true, title: true, slug: true, stackLanes: true },
      orderBy: { title: 'asc' },
    });
    return rows.map((c) => ({
      id: c.id,
      title: c.title,
      slug: c.slug,
      stackLanes: parseLanes(c.stackLanes).map((l) => ({ id: l.id, label: l.label })),
    }));
  }

  async getCareer(id: string) {
    const career = await this.prisma.career.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        requirements: { include: { skill: true } },
      },
    });
    if (!career) {
      throw new NotFoundException({ error: 'CAREER_NOT_FOUND', message: 'Career not found' });
    }
    return career;
  }

  async createGoal(userId: string, dto: CreateCareerGoalDto) {
    const career = await this.prisma.career.findFirst({
      where: {
        OR: [{ id: dto.careerIdOrSlug }, { slug: dto.careerIdOrSlug }],
      },
    });
    if (!career) {
      throw new NotFoundException({ error: 'CAREER_NOT_FOUND', message: 'Career not found' });
    }

    await this.prisma.careerGoal.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    const created = await this.prisma.careerGoal.create({
      data: {
        userId,
        careerId: career.id,
        isActive: true,
        customTitle: dto.customTitle,
      },
      include: { career: true },
    });
    await this.corpus.syncCareer(career.slug);
    await this.corpus.ensureUserRoadmap(userId);
    return created;
  }

  async updateGoal(userId: string, id: string, dto: UpdateCareerGoalDto) {
    const goal = await this.prisma.careerGoal.findFirst({ where: { id, userId } });
    if (!goal) {
      throw new NotFoundException({ error: 'GOAL_NOT_FOUND', message: 'Career goal not found' });
    }
    if (dto.isActive === true) {
      await this.prisma.careerGoal.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });
    }
    return this.prisma.careerGoal.update({
      where: { id },
      data: dto,
      include: { career: true },
    });
  }

  async getAnalysis(userId: string) {
    const goal = await this.prisma.careerGoal.findFirst({
      where: { userId, isActive: true },
      include: { career: true },
    });
    if (!goal) {
      throw new NotFoundException({
        error: 'ANALYSIS_NOT_FOUND',
        message: 'No active career goal / analysis',
      });
    }
    const emptyBreakdown =
      !goal.breakdown ||
      (typeof goal.breakdown === 'object' &&
        Object.values(goal.breakdown as Record<string, number>).every((n) => !n));
    if (!goal.lastAnalyzedAt || goal.estimatedMatch === 0 || emptyBreakdown) {
      await this.fit.persist(userId);
    }
    const fresh = await this.prisma.careerGoal.findFirst({
      where: { id: goal.id },
      include: { career: true },
    });
    if (!fresh) {
      throw new NotFoundException({
        error: 'ANALYSIS_NOT_FOUND',
        message: 'No active career goal / analysis',
      });
    }
    return {
      careerTitle: fresh.customTitle ?? fresh.career.title,
      analyzed: fresh.lastAnalyzedAt !== null,
      estimatedMatch: fresh.estimatedMatch,
      breakdown: fresh.breakdown,
      whyItMayFit: fresh.whyItMayFit,
      strongAreas: fresh.strongAreas,
      missingAreas: fresh.missingAreas,
      potentialChallenges: fresh.potentialChallenges,
      evidence: fresh.evidence,
      lastAnalyzedAt: fresh.lastAnalyzedAt,
    };
  }

  async runAnalysis(userId: string) {
    const goal = await this.prisma.careerGoal.findFirst({
      where: { userId, isActive: true },
      include: { career: true },
    });
    if (!goal) {
      throw new NotFoundException({
        error: 'GOAL_NOT_FOUND',
        message: 'Set a career goal before running analysis',
      });
    }

    let full;
    try {
      full = await this.agent.analyzeCareer(userId);
    } catch {
      const heuristic = await this.fit.persist(userId);
      if (!heuristic) {
        throw new NotFoundException({
          error: 'GOAL_NOT_FOUND',
          message: 'Set a career goal before running analysis',
        });
      }
      return this.getAnalysis(userId);
    }
    const scored = this.recommendations.estimateCareerMatch({
      skillScore: Number(full.breakdown.skills),
      projectScore: Number(full.breakdown.projects),
      educationScore: Number(full.breakdown.education),
      experienceScore: Number(full.breakdown.experience),
      marketScore: Number(full.breakdown.marketAlignment),
    });

    const updated = await this.prisma.careerGoal.update({
      where: { id: goal.id },
      data: {
        estimatedMatch: scored.estimatedMatch,
        breakdown: full.breakdown as Prisma.InputJsonValue,
        whyItMayFit: full.whyItMayFit,
        strongAreas: full.strongAreas,
        missingAreas: full.missingAreas,
        potentialChallenges: full.potentialChallenges,
        evidence: full.evidence as Prisma.InputJsonValue,
        lastAnalyzedAt: new Date(),
      },
      include: { career: true },
    });

    await this.prisma.notification.create({
      data: {
        userId,
        type: 'ANALYSIS',
        title: 'Your career analysis is ready.',
        body: `${updated.career.title} platform estimated match is ${updated.estimatedMatch}% based on current evidence.`,
      },
    });

    return this.getAnalysis(userId);
  }

  async dashboard(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    const isGov = profile?.careerTrack === 'GOVERNMENT_EXAM';
    const analysis = isGov ? null : await this.getAnalysis(userId).catch(() => null);
    const gaps = isGov
      ? []
      : await this.prisma.skillGap.findMany({
          where: { userId },
          include: { skill: true },
          orderBy: { priority: 'asc' },
          take: 5,
        });
    const roadmap = await this.prisma.roadmap.findFirst({
      where: { userId },
      include: { tasks: true, career: true },
      orderBy: { createdAt: 'desc' },
    });
    const progress = isGov
      ? { percent: 0 }
      : await this.corpus.learningProgress(userId).catch(() => ({ percent: 0 }));
    const ev = isGov ? null : await this.evidence.forUser(userId);
    const optional =
      !isGov && ev?.careerSlug
        ? (await this.corpus.optionalTopics(ev.careerSlug, ev.stack)).map((t) => t.title).slice(0, 8)
        : [];
    const jobs = isGov
      ? []
      : await this.prisma.job.findMany({
          where: { isDemo: false },
          take: 2,
          include: { skills: { include: { skill: true } } },
          orderBy: { createdAt: 'asc' },
        });
    const government = isGov
      ? await this.prisma.governmentOpportunity.findMany({ take: 2, orderBy: { createdAt: 'desc' } })
      : [];
    const examPlan = isGov
      ? await this.prisma.governmentExamPlan.findFirst({
          where: { userId, isActive: true },
          include: { exam: { include: { subjects: true } }, progress: true },
        })
      : null;
    const sarkariJudge = isGov ? await this.sarkariJudge.forUser(userId) : null;
    const examTopics = examPlan?.exam.subjects.flatMap((s) => s.topics) ?? [];
    const examDone = examPlan
      ? examPlan.progress.filter((p) => p.status === 'COMPLETED').length
      : 0;

    return {
      analysis: isGov ? null : analysis,
      skillGaps: isGov ? [] : gaps.map((g) => ({
        id: g.id,
        skill: g.skill.name,
        category: g.skill.category,
        currentStatus: g.currentStatus,
        required: g.required,
        priority: g.priority,
        estimatedHours: g.estimatedHours,
        proficiency:
          g.currentStatus === 'STRONG' ? 90 : g.currentStatus === 'GOOD' ? 70 : g.currentStatus === 'NEEDS_IMPROVEMENT' ? 40 : 8,
        why: g.why,
      })),
      roadmap: isGov
        ? null
        : roadmap
          ? {
              careerTitle: roadmap.career.title,
              syllabusPercent: progress.percent,
              completed: roadmap.tasks.filter((t) => t.status === 'COMPLETED').length,
              total: roadmap.tasks.length,
            }
          : null,
      jobs: jobs.map((j) => ({
        id: j.id,
        company: j.company,
        role: j.role,
        location: j.location,
        workType: j.workType,
        experience: j.experience,
        description: j.description,
        whyMatches: j.whyMatches,
        priority: j.priority,
        isDemo: j.isDemo,
        matchedSkills: j.skills.filter((s) => !s.isMissing).map((s) => s.skill.name),
        missingSkills: j.skills.filter((s) => s.isMissing).map((s) => s.skill.name),
      })),
      government,
      examPlan: examPlan
        ? {
            slug: examPlan.exam.slug,
            shortName: examPlan.exam.shortName,
            completionPercent: examTopics.length ? Math.round((examDone / examTopics.length) * 100) : 0,
          }
        : null,
      sarkariJudge,
      evidence: ev
        ? {
            stack: ev.stack,
            stackLabel: ev.stackLabel,
            confidence: ev.confidence,
            stackOptions: ev.stackOptions,
            seniority: ev.seniority,
            learnerTier: ev.learnerTier,
            roleSkillMatchPercent: ev.roleSkillMatchPercent,
            suggestedStatus: ev.suggestedStatus,
            needsStackConfirm: !ev.stack || ev.confidence < 0.35,
            studyNext: gaps
              .filter((g) => g.required)
              .slice(0, 5)
              .map((g) => g.skill.name),
            optional,
            alternatives: ev.family.lanes.filter((l) => l.id !== ev.stack).map((l) => l.label),
          }
        : null,
    };
  }
}
