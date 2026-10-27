import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { LlmService } from '../ai/llm.service';
import { skillMatches } from '../ai/skill-match';
import { GithubEvidenceService } from '../learner/github-evidence.service';
import { SkillEvidenceService } from '../learner/skill-evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PrepLessonStatus,
  PrepPackageStatus,
  PrepPlan,
  PrepSessionStatus,
  PrepUsageKind,
  Prisma,
} from '../prisma/client';
import { RedisService } from '../redis/redis.service';
import { SkillGapService } from '../skill-gap/skill-gap.service';
import { GithubAnalyzeService } from '../web/github-analyze.service';
import { requireOwnedSession } from './access';
import { selectTasksForApply } from './apply-tasks';
import { buildDeterministicPackage, choosePackageSource, findIdempotentAttempt, genericCareerScope, hashPackage, keepKnownResources, type PackageInput } from './package-builder';
import { gradeSchema, prepContentSchema, prepRubricSchema, toLearnerContent, type PrepContent, type PrepRubric } from './package.schema';
import { assertCan, limitFor, prepLimitsFromEnv, prepQuotaKey } from './quota';
import { applySecondOpinion, scoreQuestion } from './scorer';
import { deriveProgress, type AttemptView, type TaskView } from './status';
import { buildVersionInfo, resolveTargetPackageId, shouldAbandonForSwitch } from './version-switch';
import type { AttemptDto, HintDto, StartPrepDto, TaskEvidenceDto } from './preparation.dto';

const explanationSchema = z.object({
  explanation: z.string().min(8).max(4000),
  examples: z.array(z.string().max(500)).max(4),
  mistakes: z.array(z.string().max(500)).max(4),
});

const HINT_TIMEOUT_MS = 60_000;
const GRADE_TIMEOUT_MS = 60_000;
const PACKAGE_MODEL_TIMEOUT_MS = 90_000;

type SessionGraph = Prisma.PrepSessionGetPayload<{
  include: {
    package: true;
    lessons: true;
    attempts: true;
    tasks: true;
    skill: true;
    roadmapTask: true;
  };
}>;

@Injectable()
export class PreparationService {
  private readonly logger = new Logger(PreparationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly llm: LlmService,
    private readonly skillGaps: SkillGapService,
    private readonly evidence: SkillEvidenceService,
    private readonly github: GithubAnalyzeService,
    private readonly githubEvidence: GithubEvidenceService,
  ) {}

  async listPackages(userId: string, skillId: string) {
    if (!skillId.trim()) {
      throw new BadRequestException({ error: 'SKILL_REQUIRED', message: 'skillId is required' });
    }
    const skill = await this.prisma.skill.findUnique({ where: { id: skillId }, select: { id: true, name: true } });
    if (!skill) throw new NotFoundException({ error: 'SKILL_NOT_FOUND', message: 'Skill not found' });
    const p = await this.prisma.prepPackage.findMany({
      where:{
        skillId,
      }
    });
    console.log("p",p);


    const packages = await this.prisma.prepPackage.findMany({
      where: { skillId, careerScope: genericCareerScope(), status: PrepPackageStatus.PUBLISHED },
      orderBy: { version: 'asc' },
      select: { id: true, version: true, publishedAt: true, content: true },
    });
    // console.log(packages);
    const versions = packages.map((row) => {
      const content = this.contentOf(row.content);
      return {
        packageId: row.id,
        version: row.version,
        publishedAt: row.publishedAt,
        difficulty: content.difficulty,
        estimatedMinutes: content.estimatedMinutes,
        lessonCount: content.lessons.length,
      };
    });
    const latest = versions.length ? versions[versions.length - 1] : null;
    const mySessions = await this.prisma.prepSession.findMany({
      where: { userId, skillId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: { package: { select: { id: true, version: true } } },
    });
    return {
      skillId: skill.id,
      skillName: skill.name,
      versions,
      latestVersion: latest?.version ?? null,
      latestPackageId: latest?.packageId ?? null,
      mySessions: mySessions.map((row) => ({
        sessionId: row.id,
        packageId: row.package.id,
        version: row.package.version,
        status: row.status,
        updatedAt: row.updatedAt,
      })),
    };
  }

  async start(userId: string, dto: StartPrepDto) {
    const resolved = await this.resolveSkill(userId, dto);
    const wantsSpecific = Boolean(dto.packageId || dto.packageVersion != null);

    let open = await this.prisma.prepSession.findFirst({
      where: {
        userId,
        skillId: resolved.skillId,
        status: { in: [PrepSessionStatus.IN_PROGRESS, PrepSessionStatus.NEEDS_PRACTICE] },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (wantsSpecific) {
      const target = await this.resolvePublishedTarget(resolved.skillId, {
        packageId: dto.packageId,
        packageVersion: dto.packageVersion,
      });
      if (open && shouldAbandonForSwitch(open.packageId, target.id, Boolean(dto.switchVersion))) {
        await this.prisma.prepSession.update({
          where: { id: open.id },
          data: { status: PrepSessionStatus.ABANDONED },
        });
        open = null;
      }
      if (open && open.packageId === target.id) {
        return this.resumeOpen(userId, open.id, resolved.roadmapTaskId);
      }
      if (open && !dto.switchVersion) {
        // Backward compatible: keep old session; client sees upgradeAvailable via versionInfo.
        return this.resumeOpen(userId, open.id, resolved.roadmapTaskId);
      }
      return this.createSession(userId, resolved, target);
    }

    if (open) {
      return this.resumeOpen(userId, open.id, resolved.roadmapTaskId);
    }
    const pkg = await this.ensurePackage(userId, resolved, Boolean(dto.generate));
    return this.createSession(userId, resolved, pkg);
  }

  private async resumeOpen(userId: string, sessionId: string, roadmapTaskId: string | null) {
    const open = await this.loadOwned(userId, sessionId);
    const patch: Prisma.PrepSessionUpdateInput = {};
    if (roadmapTaskId && open.roadmapTaskId !== roadmapTaskId) {
      patch.roadmapTask = { connect: { id: roadmapTaskId } };
    }
    if (open.status === PrepSessionStatus.NEEDS_PRACTICE) {
      patch.status = PrepSessionStatus.IN_PROGRESS;
    }
    if (Object.keys(patch).length) {
      await this.prisma.prepSession.update({ where: { id: open.id }, data: patch });
    }
    return this.present(await this.loadOwned(userId, open.id));
  }

  private async createSession(
    userId: string,
    resolved: {
      skillId: string;
      skillName: string;
      careerTitle: string;
      careerId: string | null;
      phase: string | null;
      dailyHours: number | null;
      roadmapTaskId: string | null;
    },
    pkg: { id: string; content: Prisma.JsonValue },
  ) {
    try {
      const created = await this.prisma.prepSession.create({
        data: {
          userId,
          skillId: resolved.skillId,
          careerId: resolved.careerId,
          packageId: pkg.id,
          roadmapTaskId: resolved.roadmapTaskId,
          resumeState: { lessonKey: null },
          lessons: {
            create: this.contentOf(pkg.content).lessons.map((lesson) => ({ lessonKey: lesson.key })),
          },
        },
      });
      return this.present(await this.loadOwned(userId, created.id));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const again = await this.prisma.prepSession.findFirst({
          where: { userId, skillId: resolved.skillId, status: PrepSessionStatus.IN_PROGRESS },
        });
        if (again) return this.present(await this.loadOwned(userId, again.id));
      }
      throw err;
    }
  }

  async current(userId: string, skillId: string) {
    const open = await this.prisma.prepSession.findFirst({
      where: {
        userId,
        skillId,
        status: { in: [PrepSessionStatus.IN_PROGRESS, PrepSessionStatus.NEEDS_PRACTICE] },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const session = open ?? await this.prisma.prepSession.findFirst({
      where: { userId, skillId },
      orderBy: { updatedAt: 'desc' },
    });
    if (!session) throw new NotFoundException({ error: 'PREP_SESSION_NOT_FOUND', message: 'Preparation session not found' });
    return this.present(await this.loadOwned(userId, session.id));
  }

  async completeLesson(userId: string, sessionId: string, lessonKey: string) {
    const session = await this.loadOwned(userId, sessionId);
    const content = this.contentOf(session.package.content);
    const lesson = content.lessons.find((row) => row.key === lessonKey);
    if (!lesson) throw new NotFoundException({ error: 'LESSON_NOT_FOUND', message: 'Lesson not found' });
    const answered = new Set(session.attempts.map((row) => row.questionKey));
    if (lesson.questionKeys.some((key) => !answered.has(key))) {
      throw new BadRequestException({ error: 'LESSON_INCOMPLETE', message: 'Answer every question in this lesson before completing it' });
    }
    await this.prisma.prepLessonProgress.upsert({
      where: { sessionId_lessonKey: { sessionId, lessonKey } },
      update: { status: PrepLessonStatus.COMPLETED, completedAt: new Date() },
      create: { sessionId, lessonKey, status: PrepLessonStatus.COMPLETED, completedAt: new Date() },
    });
    return this.present(await this.refreshStatus(sessionId));
  }

  async submitAttempt(userId: string, sessionId: string, dto: AttemptDto) {
    const limits = prepLimitsFromEnv();
    if (dto.answer.length > limits.maxInputChars) {
      throw new BadRequestException({ error: 'INPUT_TOO_LARGE', message: `Answer must be at most ${limits.maxInputChars} characters` });
    }
    const session = await this.loadOwned(userId, sessionId);
    const prior = findIdempotentAttempt(session.attempts, dto.idempotencyKey);
    if (prior) return { attempt: this.publicAttempt(prior), progress: (await this.present(session)).progress, duplicate: true };
    const content = this.contentOf(session.package.content);
    const rubric = this.rubricOf(session.package.rubric);
    if (!content.questions.some((q) => q.key === dto.questionKey)) {
      throw new NotFoundException({ error: 'QUESTION_NOT_FOUND', message: 'Question not found' });
    }
    let scored = scoreQuestion(content, rubric, dto.questionKey, dto.answer);
    if (scored.needsSecondOpinion) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { prepPlan: true } });
      const allowed = user ? await this.consume(userId, user.prepPlan, PrepUsageKind.GRADE) : false;
      if (allowed && this.llm.isConfigured()) {
        const model = await this.gradeWithModel(content, dto.questionKey, dto.answer);
        scored = applySecondOpinion(scored, model, rubric.passLine);
      } else if (scored.needsSecondOpinion) {
        scored = { ...scored, needsSecondOpinion: false };
      }
    }
    const attemptNumber = session.attempts.filter((row) => row.questionKey === dto.questionKey).length + 1;
    try {
      await this.prisma.prepAttempt.create({
        data: {
          sessionId,
          questionKey: dto.questionKey,
          attemptNumber,
          answer: dto.answer.slice(0, limits.maxInputChars),
          score: scored.score,
          feedback: scored.feedback,
          passed: scored.passed,
          idempotencyKey: dto.idempotencyKey,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const again = await this.loadOwned(userId, sessionId);
        const existing = findIdempotentAttempt(again.attempts, dto.idempotencyKey);
        if (existing) return { attempt: this.publicAttempt(existing), progress: (await this.present(again)).progress, duplicate: true };
      }
      throw err;
    }
    const question = content.questions.find((q) => q.key === dto.questionKey);
    if (question) {
      await this.prisma.prepLessonProgress.updateMany({
        where: { sessionId, lessonKey: question.lessonKey, status: PrepLessonStatus.NOT_STARTED },
        data: { status: PrepLessonStatus.IN_PROGRESS },
      });
      await this.prisma.prepSession.update({
        where: { id: sessionId },
        data: { resumeState: { lessonKey: question.lessonKey, questionKey: dto.questionKey } },
      });
    }
    const refreshed = await this.refreshStatus(sessionId);
    const saved = refreshed.attempts.find((row) => row.idempotencyKey === dto.idempotencyKey);
    return { attempt: saved ? this.publicAttempt(saved) : null, progress: (await this.present(refreshed)).progress, duplicate: false };
  }

  async history(userId: string, sessionId: string) {
    const session = await this.loadOwned(userId, sessionId);
    return {
      attempts: session.attempts
        .slice()
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((row) => this.publicAttempt(row)),
      tasks: session.tasks.map((row) => ({
        taskKey: row.taskKey,
        verified: row.verified,
        score: row.score,
        feedback: row.feedback,
        createdAt: row.createdAt,
      })),
    };
  }

  async submitTask(userId: string, sessionId: string, dto: TaskEvidenceDto) {
    const session = await this.loadOwned(userId, sessionId);
    const content = this.contentOf(session.package.content);
    const rubric = this.rubricOf(session.package.rubric);
    const task = content.tasks.find((row) => row.key === dto.taskKey);
    if (!task) throw new NotFoundException({ error: 'TASK_NOT_FOUND', message: 'Practical task not found' });
    const taskRubric = rubric.tasks[dto.taskKey] ?? {};
    const evidenceKind = task.evidenceKind ?? taskRubric.evidenceKind ?? (taskRubric.requiresGithub ? 'github' : 'text');
    const needsGithub = evidenceKind === 'github' || taskRubric.requiresGithub === true;
    let verified = false;
    let feedback = 'Evidence was saved. It does not yet show this skill.';
    if (needsGithub) {
      const analysis = this.github.isGithubRepo(dto.evidence)
        ? await this.github.analyzeUrl(dto.evidence, { skipLlm: true }).catch(() => null)
        : null;
      verified = Boolean(analysis && skillMatches(content.skillName, analysis.skills));
      feedback = verified
        ? `The repository shows ${content.skillName}.`
        : 'Paste a public GitHub repository whose files or dependencies show this skill. A definition is not evidence.';
      if (verified) {
        const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { id: true } });
        if (profile) {
          await this.githubEvidence.remember(profile.id, dto.evidence, analysis?.skills ?? []).catch((err: Error) => {
            this.logger.warn(`GitHub evidence skipped: ${err.message}`);
          });
        }
      }
    } else if (evidenceKind === 'url') {
      verified = /^https?:\/\/\S+/i.test(dto.evidence.trim());
      feedback = verified
        ? 'URL evidence was accepted for this task.'
        : 'Paste a full http(s) URL as evidence.';
    } else if (evidenceKind === 'text') {
      const patterns = taskRubric.acceptPatterns ?? [];
      const text = dto.evidence.trim();
      verified = text.length >= 24 && (patterns.length === 0 || patterns.some((p) => text.toLowerCase().includes(p.toLowerCase())));
      feedback = verified
        ? 'Written evidence meets the acceptance check.'
        : 'Write a concrete description that meets the acceptance criteria.';
    } else if (evidenceKind === 'none') {
      verified = true;
      feedback = 'This task does not require external evidence.';
    }
    await this.prisma.prepTaskSubmission.create({
      data: { sessionId, taskKey: dto.taskKey, evidence: dto.evidence, verified, score: verified ? 100 : 0, feedback },
    });
    const refreshed = await this.refreshStatus(sessionId);
    return { verified, feedback, progress: (await this.present(refreshed)).progress };
  }

  async hint(userId: string, sessionId: string, dto: HintDto) {
    const session = await this.loadOwned(userId, sessionId);
    const content = this.contentOf(session.package.content);
    const question = content.questions.find((row) => row.key === dto.questionKey);
    if (!question) throw new NotFoundException({ error: 'QUESTION_NOT_FOUND', message: 'Question not found' });
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { prepPlan: true } });
    if (!user || !(await this.consume(userId, user.prepPlan, PrepUsageKind.HINT))) {
      throw new HttpException({ error: 'PREP_QUOTA', message: 'Daily preparation quota is used up', usage: await this.usage(userId) }, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!this.llm.isConfigured()) {
      return { hint: `Describe one real use of ${content.skillName}: inputs, a failure, and how you would check it. Do not only repeat the name.` };
    }
    try {
      const text = await this.llm.complete(
        [
          {
            role: 'system',
            content:
              'Give one short hint for a career-skill question. One or two sentences. Do not reveal option ids, answer keys, or a full answer.',
          },
          {
            role: 'user',
            content: `Skill: ${content.skillName}. Question: ${question.prompt}`,
          },
        ],
        { temperature: 0, timeoutMs: HINT_TIMEOUT_MS },
      );
      const hint = text.replace(/^["'\s]+|["'\s]+$/g, '').slice(0, 400);
      if (hint.length < 8) throw new Error('empty hint');
      return { hint };
    } catch (err) {
      this.logger.warn(`Hint fallback: ${(err as Error).message}`);
      return { hint: `Name a concrete check you would run after using ${content.skillName}.` };
    }
  }

  async apply(userId: string, sessionId: string) {
    const session = await this.loadOwned(userId, sessionId);
    const progress = this.summary(session);
    if (progress.status !== 'VERIFIED' || session.status !== PrepSessionStatus.VERIFIED) {
      throw new ConflictException({ error: 'PREP_NOT_VERIFIED', message: 'Verify the preparation before updating the roadmap' });
    }
    const content = this.contentOf(session.package.content);
    const tasks = await this.prisma.roadmapTask.findMany({
      where: { roadmap: { userId }, status: { not: 'COMPLETED' } },
      select: { id: true, relatedSkill: true, title: true, phase: true },
    });
    const opened = session.roadmapTask ? { id: session.roadmapTask.id, phase: session.roadmapTask.phase } : null;
    const ids = selectTasksForApply(tasks, content.skillName, opened);
    await this.skillGaps.applySkillPractice(userId, content.skillName, session.skillId, 'Verified preparation', 15, true, ids);
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { id: true } });
    if (profile) {
      await this.evidence.observe({
        profileId: profile.id,
        skillId: session.skillId,
        source: 'ASSESSMENT',
        quality: 'ASSESSED',
        sourceRef: session.id,
        signal: 'Preparation verified and applied by the learner.',
      }).catch((err: Error) => this.logger.warn(`Evidence skipped: ${err.message}`));
    }
    return { applied: true, roadmapTasksCompleted: ids.length, status: session.status };
  }

  async usage(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { prepPlan: true } });
    const plan = user?.prepPlan ?? PrepPlan.FREE;
    const limits = prepLimitsFromEnv();
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const rows = await this.prisma.prepUsage.groupBy({
      by: ['kind'],
      where: { userId, createdAt: { gte: start } },
      _count: { _all: true },
    });
    const count = (kind: PrepUsageKind) => rows.find((row) => row.kind === kind)?._count._all ?? 0;
    return {
      plan,
      generates: { used: count(PrepUsageKind.GENERATE), limit: limitFor(plan, PrepUsageKind.GENERATE, limits) },
      grades: { used: count(PrepUsageKind.GRADE) + count(PrepUsageKind.HINT), limit: limitFor(plan, PrepUsageKind.GRADE, limits) },
    };
  }

  private async consume(userId: string, plan: PrepPlan, kind: PrepUsageKind) {
    const limits = prepLimitsFromEnv();
    const limit = limitFor(plan, kind, limits);
    const key = prepQuotaKey(userId, kind);
    const used = await this.redis.incr(key);
    if (used === 1) await this.redis.expire(key, 2 * 24 * 3600);
    try {
      assertCan(used, limit);
    } catch {
      return false;
    }
    await this.prisma.prepUsage.create({ data: { userId, kind, model: this.llm.isConfigured() ? this.llm.provider() : null } });
    return true;
  }

  private async ensurePackage(userId: string, resolved: { skillId: string; skillName: string; careerTitle: string; careerId: string | null; phase: string | null; dailyHours: number | null }, generate: boolean) {
    const existing = await this.prisma.prepPackage.findFirst({
      where: { skillId: resolved.skillId, careerScope: genericCareerScope(), status: PrepPackageStatus.PUBLISHED },
      orderBy: { version: 'desc' },
    });
    if (choosePackageSource(Boolean(existing), generate, true) === 'reuse' && existing) return existing;
    const resources = await this.prisma.learningResource.findMany({
      where: { skillId: resolved.skillId, active: true },
      select: { title: true, url: true, kind: true },
    });
    const relations = await this.prisma.skillRelation.findMany({
      where: { skillId: resolved.skillId },
      include: { related: { select: { id: true, name: true } } },
    });
    const input: PackageInput = {
      skillId: resolved.skillId,
      skillName: resolved.skillName,
      careerTitle: resolved.careerTitle,
      dailyHours: resolved.dailyHours,
      phase: resolved.phase,
      prerequisites: relations.map((row) => ({ skillId: row.related.id, name: row.related.name })),
      resources: resources.map((row) => ({ title: row.title, url: row.url, kind: row.kind })),
    };
    let built = buildDeterministicPackage(input);
    let source = choosePackageSource(false, generate, false);
    if (generate) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { prepPlan: true } });
      const allowed = user ? await this.consume(userId, user.prepPlan, PrepUsageKind.GENERATE) : false;
      source = choosePackageSource(false, true, allowed);
      if (source === 'model') {
        const modeled = await this.modelExplanation(input, built.content).catch((err: Error) => {
          this.logger.warn(`Package model fallback: ${err.message}`);
          return null;
        });
        if (modeled) {
          built = { content: modeled, rubric: built.rubric, contentHash: hashPackage(modeled, built.rubric) };
        }
      }
    }
    const latest = await this.prisma.prepPackage.findFirst({
      where: { skillId: resolved.skillId, careerScope: genericCareerScope() },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return this.prisma.prepPackage.create({
      data: {
        skillId: resolved.skillId,
        careerScope: genericCareerScope(),
        version: (latest?.version ?? 0) + 1,
        content: built.content as Prisma.InputJsonValue,
        rubric: built.rubric as Prisma.InputJsonValue,
        contentHash: built.contentHash,
        status: PrepPackageStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
  }

  private async modelExplanation(input: PackageInput, content: PrepContent) {
    if (!this.llm.isConfigured()) return null;
    const known = new Set(input.resources.map((row) => row.url));
    const parsed = explanationSchema.parse(await this.llm.structured(explanationSchema, [
      new SystemMessage('Write a short practice explanation for one skill. Do not invent URLs. Do not include answer keys.'),
      new HumanMessage(`Skill: ${input.skillName}. Career: ${input.careerTitle}.`),
    ], { temperature: 0, timeoutMs: PACKAGE_MODEL_TIMEOUT_MS, label: 'Prep package explanation' }));
    const next = keepKnownResources({
      ...content,
      lessons: content.lessons.map((lesson, index) => index === 0 ? { ...lesson, explanation: parsed.explanation, examples: parsed.examples, mistakes: parsed.mistakes } : lesson),
    }, known);
    return prepContentSchema.parse(next);
  }

  private async gradeWithModel(content: PrepContent, questionKey: string, answer: string) {
    const question = content.questions.find((row) => row.key === questionKey);
    if (!question) return null;
    try {
      const parsed = gradeSchema.parse(
        await this.llm.structured(
          gradeSchema,
          [
            new SystemMessage('Grade one career-skill answer. Pass only for a specific working explanation. JSON score 0-100. 70 or more passes. Do not mention hidden keys.'),
            new HumanMessage(`Skill ${content.skillName}. Question: ${question.prompt}. Answer: ${answer.slice(0, 2000)}`),
          ],
          { temperature: 0, timeoutMs: GRADE_TIMEOUT_MS, label: 'Prep grade' },
        ),
      );
      return { score: parsed.score, feedback: parsed.feedback };
    } catch (err) {
      this.logger.warn(`Grade fallback: ${(err as Error).message}`);
      return null;
    }
  }

  private async refreshStatus(sessionId: string) {
    const session = await this.prisma.prepSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { package: true, lessons: true, attempts: true, tasks: true, skill: true, roadmapTask: true },
    });
    const summary = this.summary(session);
    if (session.status !== summary.status) {
      await this.prisma.prepSession.update({ where: { id: sessionId }, data: { status: summary.status } });
      session.status = summary.status;
    }
    return session;
  }

  private async resolveSkill(userId: string, dto: StartPrepDto) {
    const goal = await this.prisma.careerGoal.findFirst({
      where: { userId, isActive: true },
      include: { career: { select: { id: true, title: true } } },
    });
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { availableHoursPerDay: true } });
    let skillId = dto.skillId;
    let phase: string | null = null;
    let roadmapTaskId: string | null = dto.roadmapTaskId ?? null;
    if (roadmapTaskId) {
      const task = await this.prisma.roadmapTask.findFirst({
        where: { id: roadmapTaskId, roadmap: { userId } },
      });
      if (!task) throw new NotFoundException({ error: 'TASK_NOT_FOUND', message: 'Roadmap task not found' });
      phase = task.phase;
      if (!skillId) {
        const skill = await this.prisma.skill.findFirst({
          where: { OR: [{ name: task.relatedSkill ?? task.title }, { name: task.title }] },
          select: { id: true },
        });
        if (!skill) throw new NotFoundException({ error: 'SKILL_NOT_FOUND', message: 'Skill not found for this roadmap task' });
        skillId = skill.id;
      }
    }
    if (!skillId) throw new BadRequestException({ error: 'SKILL_REQUIRED', message: 'skillId or roadmapTaskId is required' });
    const skill = await this.prisma.skill.findUnique({ where: { id: skillId }, select: { id: true, name: true } });
    if (!skill) throw new NotFoundException({ error: 'SKILL_NOT_FOUND', message: 'Skill not found' });
    return {
      skillId: skill.id,
      skillName: skill.name,
      careerId: goal?.career.id ?? null,
      careerTitle: goal?.career.title ?? 'your target role',
      dailyHours: profile?.availableHoursPerDay ?? null,
      phase,
      roadmapTaskId,
    };
  }

  private async loadOwned(userId: string, sessionId: string): Promise<SessionGraph> {
    const session = await this.prisma.prepSession.findFirst({
      where: { id: sessionId, userId },
      include: { package: true, lessons: true, attempts: true, tasks: true, skill: true, roadmapTask: true },
    });
    return requireOwnedSession(session, userId);
  }

  private contentOf(value: Prisma.JsonValue): PrepContent {
    return prepContentSchema.parse(value);
  }

  private rubricOf(value: Prisma.JsonValue): PrepRubric {
    return prepRubricSchema.parse(value);
  }

  private summary(session: SessionGraph) {
    const content = this.contentOf(session.package.content);
    const rubric = this.rubricOf(session.package.rubric);
    const attempts: AttemptView[] = session.attempts.map((row) => ({
      questionKey: row.questionKey,
      score: row.score,
      passed: row.passed,
      attemptNumber: row.attemptNumber,
    }));
    const tasks: TaskView[] = session.tasks.map((row) => ({ taskKey: row.taskKey, verified: row.verified }));
    return deriveProgress(content, attempts, tasks, rubric.passLine);
  }

  private async resolvePublishedTarget(
    skillId: string,
    opts: { packageId?: string; packageVersion?: number },
  ) {
    const rows = await this.prisma.prepPackage.findMany({
      where: { skillId, careerScope: genericCareerScope() },
      select: { id: true, version: true, status: true, content: true, rubric: true },
    });
    const resolved = resolveTargetPackageId(
      rows.map((row) => ({ id: row.id, version: row.version, status: row.status })),
      opts,
    );
    if ('error' in resolved) {
      if (resolved.error === 'NOT_PUBLISHED') {
        throw new BadRequestException({ error: 'PREP_NOT_PUBLISHED', message: 'Only published packages can be started' });
      }
      throw new NotFoundException({ error: 'PREP_PACKAGE_NOT_FOUND', message: 'Published package version not found' });
    }
    const pkg = rows.find((row) => row.id === resolved.packageId);
    if (!pkg || pkg.status !== PrepPackageStatus.PUBLISHED) {
      throw new NotFoundException({ error: 'PREP_PACKAGE_NOT_FOUND', message: 'Published package version not found' });
    }
    return pkg;
  }

  private async present(session: SessionGraph) {
    const content = toLearnerContent(this.contentOf(session.package.content));
    const progress = this.summary(session);
    const latestPkg = await this.prisma.prepPackage.findFirst({
      where: {
        skillId: session.skillId,
        careerScope: genericCareerScope(),
        status: PrepPackageStatus.PUBLISHED,
      },
      orderBy: { version: 'desc' },
      select: { id: true, version: true },
    });
    const versionInfo = buildVersionInfo(
      session.package.version,
      session.packageId,
      latestPkg?.version ?? session.package.version,
      latestPkg?.id ?? session.packageId,
    );
    return {
      session: {
        id: session.id,
        skillId: session.skillId,
        skillName: session.skill.name,
        status: session.status,
        roadmapTaskId: session.roadmapTaskId,
        packageId: session.packageId,
        packageVersion: session.package.version,
        resumeState: session.resumeState,
        dailyHours: content.dailyHours,
      },
      package: content,
      progress,
      versionInfo,
      lessons: session.lessons.map((row) => ({ lessonKey: row.lessonKey, status: row.status, completedAt: row.completedAt })),
      latest: this.latestAttempts(session),
    };
  }

  private latestAttempts(session: SessionGraph) {
    const map = new Map<string, SessionGraph['attempts'][number]>();
    for (const row of session.attempts) {
      const prev = map.get(row.questionKey);
      if (!prev || row.attemptNumber >= prev.attemptNumber) map.set(row.questionKey, row);
    }
    return [...map.values()].map((row) => this.publicAttempt(row));
  }

  private publicAttempt(row: { questionKey: string; attemptNumber: number; answer: string; score: number; maxScore: number; feedback: string; passed: boolean; idempotencyKey: string; createdAt: Date }) {
    return {
      questionKey: row.questionKey,
      attemptNumber: row.attemptNumber,
      answer: row.answer,
      score: row.score,
      maxScore: row.maxScore,
      feedback: row.feedback,
      passed: row.passed,
      idempotencyKey: row.idempotencyKey,
      createdAt: row.createdAt,
    };
  }
}
