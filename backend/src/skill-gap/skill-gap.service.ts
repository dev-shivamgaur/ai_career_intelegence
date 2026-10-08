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
import { fallbackOutline, guidanceLevelFrom } from '../ai/skill-guidance';
import { LlmService } from '../ai/llm.service';
import { FitScoreService } from '../ai/fit-score.service';
import { ProgressService } from '../progress/progress.service';
import { GithubAnalyzeService } from '../web/github-analyze.service';
import { RoadmapCorpusService } from '../web/roadmap-corpus.service';
import { RagService } from '../rag/rag.service';
import {
  checkBand,
  hoursForTopic,
  localQuestions,
  prepareWhere,
  questionCountForPhase,
  scoreAnswers,
} from '../ai/lesson-check';
import type { PracticeAnswerDto } from './dto/practice.dto';
import { withTimeout } from '../rag/qdrant-client';

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
    private readonly rag: RagService,
    private readonly github: GithubAnalyzeService,
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

  async lesson(userId: string, gapId: string, phase?: string) {
    const gap = await this.prisma.skillGap.findFirst({
      where: { id: gapId, userId },
      include: { skill: true },
    });
    if (!gap) {
      throw new NotFoundException({ error: 'SKILL_GAP_NOT_FOUND', message: 'Skill gap not found' });
    }
    const goal = await this.prisma.careerGoal.findFirst({
      where: { userId, isActive: true },
      include: { career: true },
    });
    const role = goal?.career.title ?? 'your target role';
    const ev = await this.evidence.forUser(userId);
    const place = ev.stackLabel || role;
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: { userSkills: { include: { skill: true } } },
    });
    const us =
      profile?.userSkills.find((s) => s.skillId === gap.skillId) ??
      profile?.userSkills.find((s) => skillMatches(gap.skill.name, [s.skill.name]));
    let proficiency = us?.proficiency ?? 0;
    if (skillMatches(gap.skill.name, ev.known)) {
      proficiency = Math.max(proficiency, 55);
    }
    if (gap.currentStatus === SkillStatus.NEEDS_IMPROVEMENT) proficiency = Math.max(proficiency, 40);
    if (gap.currentStatus === SkillStatus.GOOD) proficiency = Math.max(proficiency, 55);
    if (gap.currentStatus === SkillStatus.STRONG) proficiency = Math.max(proficiency, 75);

    const evidenced = skillMatches(gap.skill.name, ev.known) || proficiency >= 40;
    const level = guidanceLevelFrom(gap.currentStatus, proficiency);
    const edu = String(profile?.educationLevel ?? 'UNDERGRADUATE');
    const band = checkBand(edu, ev.seniority);
    const where = prepareWhere(gap.skill.name, place, String(profile?.learningStyle ?? 'PROJECT'));
    const qCount = questionCountForPhase(phase);
    const hours = hoursForTopic(gap.skill.name, gap.required === false);
    const questions = localQuestions(gap.skill.name, place, level, band, qCount, phase);
    let outline = fallbackOutline(gap.skill.name, place, level);

    if (this.llm.isConfigured()) {
      try {
        const ragNotes = await withTimeout(this.ragHints(userId, gap.skill.name, place), 4_000, 'RAG hints').catch(
          () => [] as string[],
        );
        const levelHint = `Stack: ${place}. Window: ${phase ?? 'D7'} with ${qCount} checks. Teach ${gap.skill.name} as used in ${place}. No install tours or syllabus site names.`;
        const text = await this.llm.complete(
          [
            {
              role: 'system',
              content:
                'Write a short study outline for one skill inside the learner stack. Return 5 to 8 short numbered lines. No markdown. Never mention Wikipedia, roadmap.sh, or other third-party syllabus sites.',
            },
            {
              role: 'user',
              content: `Skill: ${gap.skill.name}. Stack: ${place}. Role: ${role}. ${levelHint}${ragNotes.length ? ` Local notes: ${ragNotes.join(' | ')}` : ''}`,
            },
          ],
          { temperature: 0.3, timeoutMs: 22_000 },
        );
        const parsed = text
          .split('\n')
          .map((l) => l.replace(/^\d+[.)]\s*/, '').trim())
          .filter((l) => l.length > 8 && !/wikipedia|roadmap\.sh/i.test(l))
          .slice(0, 8);
        if (parsed.length) outline = parsed;
      } catch (err) {
        this.logger.debug(`Lesson outline LLM skipped: ${(err as Error).message}`);
      }
    }
    const windowLabel = questionCountForPhase(phase) <= 7 ? '7 days' : `${questionCountForPhase(phase)} checks`;
    return {
      skill: gap.skill.name,
      learn: `${gap.skill.name} in ${place}. This window has ${qCount} checks and gets harder as the window grows. About ${hours} hours for the topic.`,
      practice: `Do one real ${place} task that uses ${gap.skill.name}, including one thing that can go wrong. ${windowLabel}.`,
      example: `Proof is a ${place} diff, test, or log — not a definition of ${gap.skill.name}.`,
      outline,
      level,
      evidenced,
      band,
      seniority: ev.seniority,
      educationLevel: edu,
      where,
      questions: questions.map((q) => ({ id: q.id, prompt: q.prompt })),
      phase: phase ?? 'D7',
      questionCount: qCount,
      evidencePrompt:
        'Paste a public GitHub URL (https://github.com/owner/repo). We open that repo, read the code and libraries (Jest, Express, React, tests, and so on), and mark this gap only when the work shows this skill. Written answers are optional when the repo is enough.',
    };
  }

  async practice(userId: string, gapId: string, note?: string, answers?: PracticeAnswerDto[]) {
    const gap = await this.prisma.skillGap.findFirst({
      where: { id: gapId, userId },
      include: { skill: true },
    });
    if (!gap) {
      throw new NotFoundException({ error: 'SKILL_GAP_NOT_FOUND', message: 'Skill gap not found' });
    }
    const goal = await this.prisma.careerGoal.findFirst({
      where: { userId, isActive: true },
      include: { career: true },
    });
    const role = goal?.career.title ?? 'your target role';
    const proof = await this.judgeGithubProof(gap.skill.name, note);
    if (proof.opened && proof.passed) {
      await this.applySkillPractice(userId, gap.skill.name, gap.skillId, note, proof.score >= 85 ? 22 : 15, true);
      void this.recalculate(userId).catch((err: Error) => {
        this.logger.warn(`Background gap recalc: ${err.message}`);
      });
      const gaps = await this.gapsForUser(userId);
      return { gaps, check: { score: proof.score, passed: true, feedback: proof.feedback } };
    }

    const questions = (answers ?? []).map((a) => ({
      id: a.id,
      prompt: a.prompt?.trim() || a.id,
      rubric: 'Working explanation, not the skill name repeated.',
    }));
    const filled = (answers ?? []).filter((a) => a.text.trim().length > 12);
    if (proof.opened && !proof.passed && filled.length === 0) {
      const gaps = await this.gapsForUser(userId);
      return { gaps, check: { score: proof.score, passed: false, feedback: proof.feedback } };
    }
    if (!proof.opened && filled.length === 0) {
      const gaps = await this.gapsForUser(userId);
      return {
        gaps,
        check: {
          score: 0,
          passed: false,
          feedback:
            'Paste a public GitHub repo that shows this skill, or answer the checks. A skill name alone is not proof.',
        },
      };
    }
    const local = scoreAnswers(gap.skill.name, questions, answers ?? []);
    let score = local.score;
    let feedback = local.feedback;
    if (answers?.length && filled.length && this.llm.isConfigured()) {
      try {
        const judged = await this.llm.complete(
          [
            {
              role: 'system',
              content:
                'You grade short career-skill answers. Pass only when the text shows the person understands the idea in their own words. Repeating the skill name, one-line definitions, or empty phrases fail. JSON only: {"score":number,"feedback":string}. score 0-100. 70 or more means the answer is actually right.',
            },
            {
              role: 'user',
              content: `Skill ${gap.skill.name} for ${role}. ${JSON.stringify(
                questions.map((q) => ({
                  q: q.prompt,
                  a: answers.find((item) => item.id === q.id)?.text ?? '',
                })),
              )}`,
            },
          ],
          { temperature: 0.1, timeoutMs: 20_000 },
        );
        const parsed = JSON.parse(judged.replace(/```json|```/g, '').trim()) as {
          score?: number;
          feedback?: string;
        };
        if (typeof parsed.score === 'number') {
          score = Math.round(Math.max(0, Math.min(100, parsed.score)));
        }
        if (parsed.feedback) feedback = String(parsed.feedback).slice(0, 500);
      } catch {
        feedback = `${local.feedback} The model check was unavailable, so this used a stricter local reading.`;
      }
    }
    if (proof.opened && !proof.passed) {
      feedback = `${proof.feedback} ${feedback}`.slice(0, 700);
    }
    const passed = score >= 70;
    if (!passed) {
      const gaps = await this.gapsForUser(userId);
      return { gaps, check: { score, passed, feedback } };
    }
    const bump = score >= 85 ? 22 : 15;
    await this.applySkillPractice(userId, gap.skill.name, gap.skillId, note, bump, true);
    void this.recalculate(userId).catch((err: Error) => {
      this.logger.warn(`Background gap recalc: ${err.message}`);
    });
    const gaps = await this.gapsForUser(userId);
    return { gaps, check: { score, passed, feedback } };
  }

  private async gapsForUser(userId: string) {
    const gaps = await this.prisma.skillGap.findMany({
      where: { userId },
      include: { skill: true },
      orderBy: [{ priority: 'asc' }, { estimatedHours: 'desc' }],
    });
    return this.present(userId, gaps);
  }

  async applySkillPractice(
    userId: string,
    skillName: string,
    skillId?: string,
    note?: string,
    bump = 15,
    passed = true,
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
    const matched = tasks.filter((t) => skillMatches(name, [t.relatedSkill ?? '', t.title]));
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
    type PlannedItem = { name: string; skillId?: string; band: Band; stretch: boolean };
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

    const created: Array<{
      id: string;
      skill: { name: string; category: string };
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
      const estimatedHours = !open ? 1 : hoursForTopic(item.name, stretch);
      const window =
        item.band === 'week' ? 'Next 7 days' : stretch ? 'Optional stretch' : 'Next 30 days';
      const where = prepareWhere(item.name, stackName, String(profile.learningStyle ?? 'PROJECT'));
      const line = `${item.name} is a ${stackName} topic for ${window}. About ${estimatedHours} hours.`;
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
            marketEvidence: line,
            reason: tierReason,
            practice: `Build or change one public repo that uses ${item.name}, including one thing that can go wrong.`,
            example: `Proof is a public GitHub URL. We open the repo and mark this only if the code shows ${item.name}.`,
            solution: `Learn ${item.name} from its own docs, do one ${stackName} task, then paste https://github.com/owner/repo.`,
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

  private githubUrls(text: string) {
    return [...text.matchAll(/https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+/gi)].map((m) => m[0]);
  }

  /**
   * Open a public GitHub URL from the evidence note and decide if that repo shows the gap skill.
   * A small project counts: Jest tests, an Express route, a React page, a README that names the work.
   */
  private async judgeGithubProof(skill: string, note?: string) {
    const urls = this.githubUrls(note ?? '');
    if (!urls.length) {
      return { opened: false, passed: false, score: 0, feedback: '' };
    }
    const analysis = await this.github.analyzeUrl(urls[0], { skipLlm: true }).catch(() => null);
    if (!analysis) {
      return {
        opened: true,
        passed: false,
        score: 0,
        feedback: `Could not open ${urls[0]}. Use a public repo (https://github.com/owner/name), not a private repo or a profile page.`,
      };
    }
    const hay = [
      ...analysis.skills,
      ...Object.keys(analysis.languages),
      ...analysis.manifests,
      analysis.summary,
    ];
    const local = skillMatches(skill, hay);
    const seen = [...new Set(analysis.skills)].slice(0, 12).join(', ') || 'no libraries named';
    let score = local ? 84 : 32;
    let feedback = local
      ? `Opened ${analysis.url}. This repo shows ${skill} (${seen}). The gap is marked from that work.`
      : `Opened ${analysis.url}. We read the files and found: ${seen}. That work does not show ${skill} yet.`;

    const needsLlmJudge = !local && score < 70;
    if (needsLlmJudge && this.llm.isConfigured()) {
      try {
        const judged = await this.llm.complete(
          [
            {
              role: 'system',
              content:
                'You check whether a public GitHub repo is real work that uses one named skill. A small student project counts: tests (Jest, pytest), one API route, one UI page, or a README that describes that skill in the code. Do not demand a large production system. Do not pass just because the README repeats the skill name with no code. JSON only: {"match":boolean,"score":number,"feedback":string}. score 0-100. 70 or more means the repo shows the skill.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                skill,
                url: analysis.url,
                languages: analysis.languages,
                skills: analysis.skills,
                hasTests: analysis.hasTests,
                manifests: analysis.manifests,
                summary: analysis.summary.slice(0, 1500),
              }),
            },
          ],
          { temperature: 0.1, timeoutMs: 18_000 },
        );
        const parsed = JSON.parse(judged.replace(/```json|```/g, '').trim()) as {
          match?: boolean;
          score?: number;
          feedback?: string;
        };
        if (typeof parsed.score === 'number') {
          score = Math.round(Math.max(0, Math.min(100, parsed.score)));
        }
        if (parsed.match === true) score = Math.max(score, 75);
        if (parsed.match === false && !local) score = Math.min(score, 64);
        if (parsed.feedback) feedback = `${String(parsed.feedback).slice(0, 420)} Repo: ${analysis.url}`;
      } catch {
        feedback = `${feedback} The model check was unavailable, so this used the libraries and files we could read.`;
      }
    }

    return { opened: true, passed: score >= 70, score, feedback };
  }

  private async ragHints(userId: string, skill: string, role: string) {
    try {
      const hits = await this.rag.retrieve(`${skill} ${role}`, userId, 4);
      return hits
        .map((h) => h.content.replace(/\s+/g, ' ').trim())
        .filter((c) => c.length > 20 && !/syllabus topic|wikipedia|roadmap\.sh/i.test(c))
        .map((c) => c.slice(0, 180))
        .slice(0, 3);
    } catch {
      return [] as string[];
    }
  }

  private async present(
    userId: string,
    gaps: Array<{
      id: string;
      skill: { name: string; category: string };
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
    const statusScore = (status: SkillStatus) =>
      status === SkillStatus.STRONG ? 90 : status === SkillStatus.GOOD ? 70 : status === SkillStatus.NEEDS_IMPROVEMENT ? 40 : 8;

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
      return {
        id: g.id,
        skill: g.skill.name,
        category: g.skill.category,
        currentStatus: g.currentStatus,
        required: g.required,
        priority: g.priority,
        estimatedHours: g.estimatedHours,
        proficiency,
        stretch: !g.required,
        why,
      };
    });
  }
}
