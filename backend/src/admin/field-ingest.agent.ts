import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { IngestStepStatus, Prisma, Priority, RequirementType, RoadmapPhase, TaskStatus } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IngestEnqueueService } from '../queue/ingest-enqueue.service';
import { LlmService } from '../ai/llm.service';
import { hasPublicSyllabusGraph, isAdvancedTopic, isLanguagePrimer, parseLanes, scoreLane } from '../ai/stack-lanes';
import { isJunkTopic } from '../ai/practice-bands';
import { WebResearchService } from '../web/web-research.service';
import { EvidenceService } from '../ai/evidence.service';
import { isExperiencedForSyllabus } from '../ai/learner-tier';

type RoadmapNode = { type?: string; data?: { label?: string; name?: string } };

export type IngestJobContext = { jobId: string };

export type IngestResult = {
  careerId: string;
  slug: string;
  source: string;
  added: string[];
  skipped: number;
  usersUpdated: number;
  note?: string;
};

/**
 * Pulls the public syllabus for one career slug, drops primers and section
 * titles, and inserts only topic names that are not already on that career.
 * Existing requirement rows are left as they are.
 */
@Injectable()
export class FieldIngestAgent {
  private readonly logger = new Logger(FieldIngestAgent.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly web: WebResearchService,
    private readonly llm: LlmService,
    private readonly evidence: EvidenceService,
    @Inject(forwardRef(() => IngestEnqueueService))
    private readonly enqueue: IngestEnqueueService,
  ) {}

  private debugLogs(): boolean {
    return process.env.FIELD_INGEST_DEBUG === '1' || process.env.FIELD_INGEST_DEBUG === 'true';
  }

  private step(message: string, data?: Record<string, unknown>) {
    if (!this.debugLogs()) return;
    const line = data ? `[FieldIngest] ${message} ${JSON.stringify(data)}` : `[FieldIngest] ${message}`;
    console.log(line);
    this.logger.log(line);
  }

  private async tracked<T>(
    ctx: IngestJobContext | undefined,
    stepKey: string,
    fn: () => Promise<T>,
    meta?: Record<string, unknown>,
  ): Promise<T> {
    this.step(stepKey, meta);
    if (!ctx?.jobId) return fn();
    const row = await this.prisma.ingestJobStep.create({
      data: {
        jobId: ctx.jobId,
        stepKey,
        status: IngestStepStatus.RUNNING,
        meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    try {
      const value = await fn();
      await this.prisma.ingestJobStep.update({
        where: { id: row.id },
        data: { status: IngestStepStatus.COMPLETED, finishedAt: new Date() },
      });
      return value;
    } catch (err) {
      await this.prisma.ingestJobStep.update({
        where: { id: row.id },
        data: {
          status: IngestStepStatus.FAILED,
          finishedAt: new Date(),
          error: (err as Error).message.slice(0, 2000),
        },
      });
      throw err;
    }
  }

  async ingestCareer(careerId: string, ctx?: IngestJobContext): Promise<IngestResult> {
    const career = await this.tracked(ctx, 'load_career', () =>
      this.prisma.career.findFirst({
        where: { OR: [{ id: careerId }, { slug: careerId }] },
        include: { requirements: { include: { skill: true } } },
      }),
    );
    this.step('STEP 1: load career from PostgreSQL', { careerId });
    if (!career) {
      this.step('STOP: career not found in DB', { careerId });
      return {
        careerId,
        slug: careerId,
        source: '',
        added: [],
        skipped: 0,
        usersUpdated: 0,
        note: 'Career not found.',
      };
    }
    if (career.isCustom) {
      this.step('STOP: custom career — agent does not modify', { slug: career.slug });
      return {
        careerId,
        slug: career.slug,
        source: '',
        added: [],
        skipped: 0,
        usersUpdated: 0,
        note: 'Custom fields stay on what the admin typed.',
      };
    }

    this.step('STEP 2: resolve roadmap.sh slug', {
      careerSlug: career.slug,
      syllabusSlug: career.syllabusSlug,
      existingRequirements: career.requirements.length,
    });
    const publicSlug = (career.syllabusSlug?.trim() || career.slug.replace(/-developer|-engineer/g, '')).trim();
    const source = `https://roadmap.sh/api/v1-official-roadmap/${publicSlug}`;
    this.step('STEP 3: check public syllabus allowlist', { publicSlug, source });
    if (!hasPublicSyllabusGraph(publicSlug)) {
      this.step('STOP: slug not on allowlist — no HTTP fetch', { publicSlug });
      return {
        careerId: career.id,
        slug: career.slug,
        source,
        added: [],
        skipped: 0,
        usersUpdated: 0,
        note: 'This slug has no public syllabus graph.',
      };
    }

    this.step('STEP 4: fetch roadmap graph from internet → roadmap.sh API', { url: source });
    const labels = await this.tracked(ctx, 'fetch_roadmap', () => this.labelsFrom(publicSlug, source), { source });
    this.step('STEP 5: compare roadmap.sh topics vs DB skill names', {
      fromRoadmapSh: labels.length,
      alreadyInDb: career.requirements.map((r) => r.skill.name),
    });
    const known = new Set(career.requirements.map((row) => row.skill.name.trim().toLowerCase()));
    const fresh = labels.filter((name) => !known.has(name.toLowerCase()));
    this.step('STEP 6: topics only on roadmap.sh (not in DB yet)', {
      count: fresh.length,
      sample: fresh.slice(0, 15),
    });

    await this.tracked(ctx, 'compare', async () => fresh, { fresh: fresh.length, known: known.size });
    this.step('STEP 7: LLM filter (optional)', { llmConfigured: this.llm.isConfigured(), inputCount: fresh.length });
    const kept = await this.tracked(
      ctx,
      'llm_filter',
      () => this.filterWithAgent(career.title, fresh),
      { inputCount: fresh.length },
    );
    this.step('STEP 8: after filter — will save up to 40', { keptCount: kept.length, sample: kept.slice(0, 10) });

    const lanes = parseLanes(career.stackLanes);
    const added: string[] = [];

    await this.tracked(
      ctx,
      'persist_requirements',
      async () => {
        for (const name of kept.slice(0, 40)) {
          const lane = this.bestLane(name, lanes);
          this.step('STEP 9: upsert Skill + CareerSkillRequirement (OPTIONAL)', { topic: name, stackLane: lane });
          const skill = await this.prisma.skill.upsert({
            where: { name },
            update: {},
            create: { name, category: lane ? 'Stack' : 'Core' },
          });
          const existing = await this.prisma.careerSkillRequirement.findFirst({
            where: { careerId: career.id, skillId: skill.id, stackLane: lane },
          });
          if (existing) {
            this.step('  skip row — requirement already exists', { topic: name, requirementId: existing.id });
            continue;
          }
          await this.prisma.careerSkillRequirement.create({
            data: {
              careerId: career.id,
              skillId: skill.id,
              importance: Priority.LOW,
              type: RequirementType.RECOMMENDED,
              layer: 'OPTIONAL',
              stackLane: lane,
            },
          });
          added.push(name);
          this.step('  saved to PostgreSQL', { topic: name, skillId: skill.id, layer: 'OPTIONAL' });
        }
        return added.length;
      },
      { candidates: Math.min(kept.length, 40) },
    );

    this.step('STEP 10: attach D30 roadmap tasks for active learners', { newTopics: added.length });
    const usersUpdated = await this.tracked(
      ctx,
      'attach_learners',
      () => this.attachForLearners(career.id, career.title, added),
      { newTopics: added.length },
    );
    this.step('STEP 11: career ingest done', {
      slug: career.slug,
      addedCount: added.length,
      added,
      usersUpdated,
    });
    return {
      careerId: career.id,
      slug: career.slug,
      source,
      added,
      skipped: labels.length - added.length,
      usersUpdated,
    };
  }

  /** Enqueues one RabbitMQ job per non-custom career. The worker runs ingestCareer. */
  async ingestAll() {
    return this.enqueue.startRun('SCHEDULER');
  }

  private async labelsFrom(publicSlug: string, source: string): Promise<string[]> {
    const json = await this.web.fetchJson<unknown>(source);
    if (!json) {
      this.step('labelsFrom: HTTP returned null/empty', { source });
      return [];
    }
    const nodes = this.nodesFrom(json);
    this.step('labelsFrom: parsed graph nodes', { nodeCount: nodes.length });
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const node of nodes) {
      if (node.type !== 'topic' && node.type !== 'subtopic' && node.type !== 'topics') continue;
      const title = (node.data?.label || node.data?.name || '').replace(/\s+/g, ' ').trim().replace(/\?$/, '');
      const key = title.toLowerCase();
      if (!title || seen.has(key) || isJunkTopic(title) || isLanguagePrimer(title)) continue;
      if (/^how (does|do|they)\b/i.test(title)) continue;
      if (title.length < 2 || title.length > 60) continue;
      seen.add(key);
      labels.push(title);
    }
    this.step('labelsFrom: topic titles extracted', { count: labels.length, sample: labels.slice(0, 12) });
    return labels;
  }

  private nodesFrom(json: unknown): RoadmapNode[] {
    if (!json || typeof json !== 'object') return [];
    const row = json as { nodes?: RoadmapNode[]; roadmap?: { nodes?: RoadmapNode[] } };
    if (Array.isArray(row.nodes)) return row.nodes;
    if (Array.isArray(row.roadmap?.nodes)) return row.roadmap.nodes;
    return [];
  }

  private bestLane(name: string, lanes: ReturnType<typeof parseLanes>): string | null {
    let best: { id: string; score: number } | null = null;
    for (const lane of lanes) {
      const score = scoreLane(name, lane);
      if (score > 0 && (!best || score > best.score)) best = { id: lane.id, score };
    }
    return best?.id ?? null;
  }

  /** Rule filter always runs first. The model only drops leftovers, and a failure keeps the rules. */
  private async filterWithAgent(role: string, names: string[]): Promise<string[]> {
    if (!names.length || !this.llm.isConfigured()) {
      this.step('filterWithAgent: skip LLM — pass all rule-filtered names', { count: names.length });
      return names;
    }
    try {
      this.step('filterWithAgent: calling LLM to drop junk titles', { role, count: names.length });
      const text = await this.llm.complete(
        [
          {
            role: 'system',
            content:
              'You filter learning topics for one job. Reply with JSON only: {"keep":["name"]}. Drop install tours, history, and vague section titles. Keep concrete skills.',
          },
          {
            role: 'user',
            content: `Role: ${role}\nTopics:\n${names.slice(0, 80).join('\n')}`,
          },
        ],
        { temperature: 0 },
      );
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        this.step('filterWithAgent: no JSON in LLM reply — keep all', {});
        return names;
      }
      const parsed = JSON.parse(match[0]) as { keep?: string[] };
      const allow = new Set((parsed.keep ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean));
      if (!allow.size) return names;
      const out = names.filter((name) => allow.has(name.toLowerCase()));
      this.step('filterWithAgent: LLM kept', { before: names.length, after: out.length });
      return out;
    } catch (err) {
      this.step('filterWithAgent: LLM failed — keep all', { error: (err as Error).message });
      return names;
    }
  }

  /**
   * Learners already on this career get a roadmap task for each new topic
   * that matches their stage. Students and freshers skip advanced topics.
   * Working professionals, and anyone with a job or freelance row, receive them.
   */
  private async attachForLearners(careerId: string, title: string, topics: string[]): Promise<number> {
    if (!topics.length) {
      this.step('attachForLearners: no new topics — skip', {});
      return 0;
    }
    const goals = await this.prisma.careerGoal.findMany({
      where: { careerId, isActive: true },
      include: {
        user: {
          include: {
            profile: { include: { experience: true } },
            roadmaps: { where: { careerId }, include: { tasks: true } },
          },
        },
      },
    });
    this.step('attachForLearners: active CareerGoals in DB', { count: goals.length });
    let updated = 0;
    for (const goal of goals) {
      const ev = await this.evidence.forUser(goal.userId);
      const experienced = isExperiencedForSyllabus(ev.learnerTier);
      const fitting = topics.filter((name) => experienced || !isAdvancedTopic(name));
      this.step('attachForLearners: user', {
        userId: goal.userId,
        learnerTier: ev.learnerTier,
        experienced,
        fittingTasks: fitting.length,
      });
      if (!fitting.length) continue;
      let roadmap = goal.user.roadmaps[0];
      if (!roadmap) {
        this.step('attachForLearners: create new Roadmap row', { userId: goal.userId, careerId });
        roadmap = await this.prisma.roadmap.create({
          data: {
            userId: goal.userId,
            careerId,
            title: `${title} learning plan`,
          },
          include: { tasks: true },
        });
      }
      const have = new Set(
        roadmap.tasks.map((task) => (task.relatedSkill ?? task.title).trim().toLowerCase()),
      );
      const create = fitting.filter((name) => !have.has(name.toLowerCase()));
      if (!create.length) {
        this.step('attachForLearners: user already has these tasks — skip', { userId: goal.userId });
        continue;
      }
      this.step('attachForLearners: insert RoadmapTask rows (phase D30)', {
        userId: goal.userId,
        roadmapId: roadmap.id,
        tasks: create,
      });
      await this.prisma.roadmapTask.createMany({
        data: create.map((name, index) => ({
          roadmapId: roadmap.id,
          title: name,
          description: `New topic on the ${title} syllabus. Added because it was not in the catalog yet.`,
          why: experienced
            ? 'Included because this learner has work experience.'
            : 'Included because this learner is still early in the field. Advanced topics were left out.',
          priority: Priority.LOW,
          estimatedEffort: '2h',
          status: TaskStatus.NOT_STARTED,
          relatedSkill: name,
          phase: RoadmapPhase.D30,
          sortOrder: 500 + index,
        })),
      });
      updated += 1;
    }
    this.step('attachForLearners: done', { usersUpdated: updated });
    return updated;
  }
}
