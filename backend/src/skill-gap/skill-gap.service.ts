import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Priority, SkillStatus, TaskStatus } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceService } from '../ai/evidence.service';
import { isJunkTopic } from '../ai/practice-bands';
import { skillMatches } from '../ai/skill-match';
import {
  baselineProofTopics,
  classifyTopic,
  topicPlanForTier,
  tierWhyReason,
} from '../ai/learner-tier';
import { requirementsForStack } from '../ai/stack-lanes';
import { LlmService } from '../ai/llm.service';
import { FitScoreService } from '../ai/fit-score.service';
import { ProgressService } from '../progress/progress.service';
import { RoadmapCorpusService } from '../web/roadmap-corpus.service';
import { hoursForTopic, prepareWhere } from '../ai/lesson-check';
import { withTimeout } from '../rag/qdrant-client';
import { marketFlags } from '../market/market.flags';
import { marketDemandSentence, selectMarketPlanSkills } from '../market/compare/compare';
import { MarketCompareService } from '../market/compare/market-compare.service';
import { LearningResourceService } from '../learner/learning-resource.service';

@Injectable()
export class SkillGapService {
  private readonly logger = new Logger(SkillGapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly llm: LlmService,
    private readonly fit: FitScoreService,
    private readonly progress: ProgressService,
    private readonly corpus: RoadmapCorpusService,
    private readonly marketCompare: MarketCompareService,
    private readonly learningResources: LearningResourceService,
  ) {}

  async list(userId: string) {
    const gaps = await this.prisma.skillGap.findMany({
      where: { userId },
      include: { skill: true },
      orderBy: [{ priority: 'asc' }, { estimatedHours: 'desc' }],
    });
    return this.present(userId, gaps);
  }

  /**
   * Same as recalculate but never throws when the user has no active goal yet.
   * Used by profile writes, where a missing goal is a normal state, not an error.
   */
  async safeRecalculate(userId: string) {
    try {
      return await this.recalculate(userId);
    } catch {
      return [];
    }
  }

  async applySkillPractice(
    userId: string,
    skillName: string,
    skillId?: string,
    note?: string,
    bump = 15,
    passed = true,
    onlyTaskIds?: string[],
  ) {
    const name = skillName.trim();
    if (!name) return;
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: { userSkills: { include: { skill: true } } },
    });
    if (!profile) return;

    let targetId = skillId;
    if (!targetId) {
      const skill = await this.prisma.skill.upsert({
        where: { name: name.slice(0, 80) },
        update: {},
        create: { name: name.slice(0, 80), category: 'Practice' },
      });
      targetId = skill.id;
    }

    const hit =
      profile.userSkills.find((us) => us.skillId === targetId) ??
      profile.userSkills.find((us) => skillMatches(name, [us.skill.name]));

    if (hit) {
      await this.prisma.userSkill.update({
        where: { id: hit.id },
        data: { proficiency: Math.min(100, hit.proficiency + bump) },
      });
    } else {
      await this.prisma.userSkill.upsert({
        where: { profileId_skillId: { profileId: profile.id, skillId: targetId } },
        update: { proficiency: { increment: bump } },
        create: {
          profileId: profile.id,
          skillId: targetId,
          proficiency: Math.min(100, Math.max(20, bump)),
          source: 'USER',
        },
      });
    }

    const tasks = await this.prisma.roadmapTask.findMany({
      where: { roadmap: { userId }, status: { not: TaskStatus.COMPLETED } },
    });
    const named = tasks.filter((t) => skillMatches(name, [t.relatedSkill ?? '', t.title]));
    const matched = onlyTaskIds ? named.filter((t) => onlyTaskIds.includes(t.id)) : named;
    if (passed && matched.length) {
      await this.prisma.roadmapTask.updateMany({
        where: { id: { in: matched.map((t) => t.id) } },
        data: {
          status: TaskStatus.COMPLETED,
          ...(note?.trim() ? { note: note.trim() } : {}),
        },
      });
    }

    await this.prisma.progressEvent.create({
      data: {
        userId,
        type: 'SKILL_PRACTICE',
        payload: { skill: name, note: note ?? null, bump, passed },
      },
    }).catch(() => undefined);

    await this.fit.persist(userId).catch(() => undefined);
    await this.progress.rebuild(userId).catch(() => undefined);
  }

  async recalculate(userId: string) {
    const goal = await this.prisma.careerGoal.findFirst({
      where: { userId, isActive: true },
      include: {
        career: { include: { requirements: { include: { skill: true } } } },
      },
    });
    if (!goal) {
      throw new NotFoundException({
        error: 'GOAL_NOT_FOUND',
        message: 'Active career goal required',
      });
    }

    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: { userSkills: { include: { skill: true } } },
    });
    if (!profile) {
      throw new NotFoundException({ error: 'PROFILE_NOT_FOUND', message: 'Profile not found' });
    }

    const ev = await this.evidence.forUser(userId);
    const byName = new Map(
      profile.userSkills.map((us) => [us.skill.name.toLowerCase(), us]),
    );
    for (const k of ev.known) {
      if (![...byName.keys()].some((n) => skillMatches(n, [k]))) {
        byName.set(k, { proficiency: 55 } as never);
      }
    }

    await this.prisma.skillGap.deleteMany({ where: { userId } });

    const stackId = profile.primaryStack?.trim() || ev.stack;
    const lane = ev.family.lanes.find((l) => l.id === stackId) ?? null;
    const stackName = lane?.label || ev.stackLabel || goal.career.title;
    const scoped = requirementsForStack(goal.career.requirements, ev.family, stackId);
    const hasLaneRows = goal.career.requirements.some((row) => row.stackLane);
    type Band = 'week' | 'applied';
    const planned: Array<{ name: string; skillId?: string; band: Band }> = [];
    const seen = new Set<string>();
    const add = (name: string, band: Band, skillId?: string) => {
      const trimmed = name.trim();
      if (!trimmed || isJunkTopic(trimmed)) return;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      planned.push({ name: trimmed, skillId, band });
    };
    if (scoped.length) {
      for (const row of scoped) {
        const core = !row.stackLane || row.layer.toUpperCase() === 'CORE';
        add(row.skill.name, core ? 'week' : 'applied', row.skillId);
      }
    } else if (!hasLaneRows) {
      for (const title of goal.career.coreTopics ?? []) add(title, 'week');
    }

    const coreTitles = goal.career.coreTopics ?? [];
    const tier = ev.learnerTier;
    const tierReason = tierWhyReason(tier);
    type PlannedItem = { name: string; skillId?: string; band: Band; stretch: boolean; marketLine?: string };
    const finalPlanned: PlannedItem[] = [];
    const finalSeen = new Set<string>();

    const pushFinal = (item: PlannedItem) => {
      const key = item.name.toLowerCase();
      if (finalSeen.has(key)) return;
      finalSeen.add(key);
      finalPlanned.push(item);
    };

    if (tier === 'unverified_professional') {
      for (const name of baselineProofTopics(goal.career.slug, stackId, coreTitles)) {
        if (skillMatches(name, ev.known)) continue;
        pushFinal({ name, band: 'week', stretch: false });
      }
    }

    for (const item of planned) {
      const known = skillMatches(item.name, ev.known);
      const classification = classifyTopic(item.name, coreTitles);
      const plan = topicPlanForTier(tier, classification, known);
      if (plan.includeInRequired) {
        const band: Band = plan.phaseBias === 'd7' ? 'week' : item.band;
        pushFinal({ name: item.name, skillId: item.skillId, band, stretch: false });
      } else if (plan.includeInStretch) {
        pushFinal({ name: item.name, skillId: item.skillId, band: 'applied', stretch: true });
      }
    }

    if (marketFlags.skillGapField()) {
      try {
        const view = await this.marketCompare.compare(goal.careerId, 'all');
        if (view.period) {
          for (const row of selectMarketPlanSkills(view.sets.marketOnly, ev.known)) {
            const advanced = classifyTopic(row.name, coreTitles) === 'advanced';
            pushFinal({
              name: row.name,
              skillId: row.skillId ?? undefined,
              band: 'applied',
              stretch: advanced,
              marketLine: marketDemandSentence(row),
            });
          }
        }
      } catch (err) {
        this.logger.debug(`Market plan skills skipped: ${(err as Error).message}`);
      }
    }

    const hourMap = await this.estimateHours(finalPlanned);
    const created: Array<{
      id: string;
      skill: { id: string; name: string; category: string };
      currentStatus: SkillStatus;
      required: boolean;
      priority: Priority;
      estimatedHours: number;
      why: unknown;
    }> = [];
    for (const item of finalPlanned) {
      const skill = item.skillId
        ? await this.prisma.skill.findUniqueOrThrow({ where: { id: item.skillId } })
        : await this.prisma.skill.upsert({
            where: { name: item.name.slice(0, 80) },
            update: {},
            create: { name: item.name.slice(0, 80), category: item.band === 'week' ? 'Core' : 'Stack' },
          });
      const us =
        byName.get(item.name.toLowerCase()) ??
        [...byName.entries()].find(([n]) => skillMatches(item.name, [n]))?.[1];
      let proficiency = us?.proficiency ?? 0;
      if (skillMatches(item.name, ev.known)) proficiency = Math.max(proficiency, 55);
      let currentStatus: SkillStatus = SkillStatus.MISSING;
      if (proficiency >= 75) currentStatus = SkillStatus.STRONG;
      else if (proficiency >= 55) currentStatus = SkillStatus.GOOD;
      else if (proficiency >= 30) currentStatus = SkillStatus.NEEDS_IMPROVEMENT;
      const open = currentStatus === SkillStatus.MISSING || currentStatus === SkillStatus.NEEDS_IMPROVEMENT;
      const stretch = item.stretch;
      const priority: Priority = stretch
        ? Priority.LOW
        : !open
          ? Priority.LOW
          : item.band === 'week'
            ? Priority.HIGH
            : Priority.MEDIUM;
      const estimatedHours = !open
        ? 1
        : hourMap.get(item.name.toLowerCase()) ?? hoursForTopic(item.name, stretch);
      const window =
        item.band === 'week' ? 'Next 7 days' : stretch ? 'Optional stretch' : 'Next 30 days';
      const where = prepareWhere(item.name, stackName, String(profile.learningStyle ?? 'PROJECT'));
      const line = item.marketLine
        ? `${item.marketLine} Focused practice is about ${estimatedHours} hours, in the ${window.toLowerCase()} band.`
        : `${item.name} is on your ${stackName} plan for ${window.toLowerCase()}. Focused practice is about ${estimatedHours} hours.`;
      const gap = await this.prisma.skillGap.create({
        data: {
          userId,
          skillId: skill.id,
          currentStatus,
          required: !stretch,
          priority,
          estimatedHours,
          why: {
            recommendation: line,
            currentProfile: us
              ? `${item.name} proficiency ${proficiency}.`
              : `No saved skill named ${item.name} yet.`,
            targetCareer: goal.career.title,
            marketEvidence: item.marketLine ?? line,
            reason: item.marketLine ?? tierReason,
            practice: `Build or change one public repo that uses ${item.name}, including one thing that can go wrong.`,
            example: `Proof is a public GitHub URL. We open the repo and mark this only if the code shows ${item.name}.`,
            solution: item.marketLine
              ? `${item.marketLine} Practice ${item.name} on one small ${stackName} task, then paste the public GitHub link for that work.`
              : `Practice ${item.name} on one small ${stackName} task, then paste the public GitHub link for that work. We open the repository and mark this skill only when the code uses it.`,
            learnWhere: where,
          },
        },
        include: { skill: true },
      });
      created.push(gap);
    }

    await this.corpus.rebuildUserRoadmap(userId).catch(() => undefined);

    return this.present(userId, created);
  }

  private async estimateHours(items: Array<{ name: string; stretch: boolean }>) {
    const out = new Map<string, number>();
    for (const item of items) out.set(item.name.toLowerCase(), hoursForTopic(item.name, item.stretch));
    if (!this.llm.isConfigured() || items.length === 0) return out;
    try {
      const text = await withTimeout(
        this.llm.complete(
          [
            {
              role: 'system',
              content:
                'Estimate focused practice hours for a student who already has a target role. Each skill gets its own integer from 2 to 20, based on how much new work it usually takes to show in a small project. Do not give every skill the same number. JSON only: {"hours":[{"name":"exact skill name","hours":8}]}',
            },
            {
              role: 'user',
              content: items.map((item) => `${item.name}${item.stretch ? ' (later stretch topic)' : ''}`).join('\n'),
            },
          ],
          { temperature: 0.2 },
        ),
        60_000,
        'Hour estimate',
      );
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start < 0 || end <= start) return out;
      const parsed = JSON.parse(text.slice(start, end + 1)) as { hours?: Array<{ name?: string; hours?: number }> };
      for (const row of parsed.hours ?? []) {
        const name = row.name?.trim().toLowerCase();
        const hours = Math.round(Number(row.hours));
        if (!name || !Number.isFinite(hours)) continue;
        if (hours < 2 || hours > 24) continue;
        out.set(name, hours);
      }
    } catch (err) {
      this.logger.warn(`Hour estimate used topic fallback: ${(err as Error).message}`);
    }
    return out;
  }

  private async present(
    userId: string,
    gaps: Array<{
      id: string;
      skill: { id: string; name: string; category: string };
      currentStatus: SkillStatus;
      required: boolean;
      priority: Priority;
      estimatedHours: number;
      why: unknown;
    }>,
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: { userSkills: { include: { skill: true } } },
    });
    const skills = profile?.userSkills ?? [];
    const resourcesBySkill = await this.learningResources.forSkills(gaps.map((g) => g.skill.id)).catch(() => new Map());
    const statusScore = (status: SkillStatus) =>
      status === SkillStatus.STRONG ? 90 : status === SkillStatus.GOOD ? 70 : status === SkillStatus.NEEDS_IMPROVEMENT ? 40 : 8;

    let marketBySkill = new Map<string, { demandPct: number | null; jobCount: number | null; companies: number | null; n: number | null; wilsonLower: number | null; trend: string | null }>();
    if (marketFlags.skillGapField()) {
      const goal = await this.prisma.careerGoal.findFirst({ where: { userId, isActive: true }, select: { careerId: true } });
      if (goal) {
        try {
          marketBySkill = await this.marketCompare.marketBySkill(goal.careerId, gaps.map((g) => g.skill.id));
        } catch (err) {
          this.logger.debug(`Market annotation skipped: ${(err as Error).message}`);
        }
      }
    }

    return gaps.map((g) => {
      const us =
        skills.find((s) => s.skill.name.toLowerCase() === g.skill.name.toLowerCase()) ??
        skills.find((s) => skillMatches(g.skill.name, [s.skill.name]));
      const proficiency = us?.proficiency ?? (g.currentStatus === SkillStatus.MISSING ? 0 : statusScore(g.currentStatus));
      const why: Record<string, unknown> =
        g.why && typeof g.why === 'object'
          ? { ...(g.why as Record<string, unknown>) }
          : { recommendation: String(g.why ?? '') };
      if (!Array.isArray(why.learnWhere)) {
        why.learnWhere = prepareWhere(g.skill.name, 'your stack', 'PROJECT');
      }
      const market = marketBySkill.get(g.skill.id);
      const resources = resourcesBySkill.get(g.skill.id);
      return {
        id: g.id,
        skillId: g.skill.id,
        skill: g.skill.name,
        category: g.skill.category,
        currentStatus: g.currentStatus,
        required: g.required,
        priority: g.priority,
        estimatedHours: g.estimatedHours,
        proficiency,
        stretch: !g.required,
        why,
        ...(market ? { market } : {}),
        ...(resources?.length ? { resources } : {}),
      };
    });
  }
}
