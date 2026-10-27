import { Injectable, Logger } from '@nestjs/common';
import { CareerTrack, Priority, RequirementType, RoadmapPhase, SkillSource, TaskStatus } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RagService } from '../rag/rag.service';
import { WebResearchService } from './web-research.service';
import { EvidenceService } from '../ai/evidence.service';
import { skillMatches } from '../ai/skill-match';
import { hoursForTopic } from '../ai/lesson-check';
import { isJunkTopic, splitThirds } from '../ai/practice-bands';
import {
  baselineProofTopics,
  classifyTopic,
  topicPlanForTier,
} from '../ai/learner-tier';
import { MarketCompareService } from '../market/compare/market-compare.service';
import { marketDemandSentence, selectMarketPlanSkills } from '../market/compare/compare';
import { marketFlags } from '../market/market.flags';
import {
  belongsToOtherLane,
  familyFromCareer,
  hasPublicSyllabusGraph,
  isAdvancedTopic,
  isCatalogCoreTopic,
  isLanguagePrimer,
  isRequiredStackTopic,
  practiceForLane,
  requirementsForStack,
  type RoleFamily,
} from '../ai/stack-lanes';

type RoadmapNode = { type?: string; data?: { label?: string; name?: string } };

@Injectable()
export class RoadmapCorpusService {
  private readonly logger = new Logger(RoadmapCorpusService.name);
  private roleRepairStarted = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rag: RagService,
    private readonly web: WebResearchService,
    private readonly evidence: EvidenceService,
    private readonly marketCompare: MarketCompareService,
  ) {}

  publicSlug(careerSlug: string, syllabusSlug?: string | null) {
    if (syllabusSlug?.trim()) return syllabusSlug.trim();
    return careerSlug.replace(/-developer|-engineer/g, '');
  }

  publicUrl(careerSlug: string, syllabusSlug?: string | null) {
    return `https://roadmap.sh/${this.publicSlug(careerSlug, syllabusSlug)}`;
  }

  /**
   * Ingest the catalog graph for this career (syllabusSlug + per-lane slugs)
   * into Postgres and Qdrant. Custom careers are skipped.
   */
  async syncCareer(careerSlug: string) {
    const career = await this.prisma.career.findFirst({
      where: { OR: [{ slug: careerSlug }, { id: careerSlug }] },
    });
    if (!career || career.isCustom) {
      return { topics: [] as string[], url: '', ingested: 0 };
    }

    const family = familyFromCareer(career);
    let ingested = 0;
    for (const title of family.core) {
      await this.persistTopics(career.slug, `core:${family.id}`, [{ title, content: `${title} is a shared core topic.` }], {
        layer: 'core',
        family: family.id,
      });
      ingested += 1;
    }
    for (const lane of family.lanes) {
      if (!hasPublicSyllabusGraph(lane.syllabusSlug)) continue;
      const already = await this.prisma.knowledgeChunk.count({
        where: { tags: { has: `lane:${lane.id}` } },
      });
      if (already > 0) continue;
      const url = `internal:${lane.syllabusSlug}`;
      const topics = await this.loadTopics(lane.syllabusSlug, url);
      const required = topics
        .filter((t) => isRequiredStackTopic(t.title, family.core))
        .slice(0, 12);
      const requiredTitles = new Set(required.map((t) => t.title.toLowerCase()));
      const optional = topics
        .filter((t) => !requiredTitles.has(t.title.toLowerCase()))
        .slice(0, 32);
      if (required.length) {
        await this.persistTopics(career.slug, url, required, { layer: 'stack_required', lane: lane.id, family: family.id });
        ingested += required.length;
      }
      if (optional.length) {
        await this.persistTopics(career.slug, `${url}#optional`, optional, { layer: 'optional', lane: lane.id, family: family.id });
        ingested += optional.length;
      }
    }
    await this.mergeLayeredRequirements(career.id, family);
    return { topics: family.core, url: '', ingested };
  }

  async topicsFor(careerSlug: string, stackLane?: string | null) {
    const career = await this.loadCareer(careerSlug);
    if (!career) return [];
    const family = familyFromCareer(career);
    const stackId = stackLane ?? null;
    const scoped = requirementsForStack(career.requirements, family, stackId);
    if (scoped.length) {
      return scoped
        .filter((row) => !isJunkTopic(row.skill.name))
        .map((row) => ({ title: row.skill.name, tags: [row.stackLane ? 'stack' : 'core'] }));
    }
    if (career.requirements.some((row) => row.stackLane)) return [];
    return (career.coreTopics ?? [])
      .map((title) => title.trim())
      .filter((title) => title && !isJunkTopic(title))
      .map((title) => ({ title, tags: ['core'] }));
  }

  async optionalTopics(careerSlug: string, stackLane?: string | null) {
    const career = await this.loadCareer(careerSlug);
    if (!career) return [];
    const family = familyFromCareer(career);
    const stackId = stackLane ?? null;
    return career.requirements
      .filter((row) => {
        if (row.layer.toUpperCase() !== 'OPTIONAL') return false;
        if (isJunkTopic(row.skill.name) || (isLanguagePrimer(row.skill.name) && family.id !== row.stackLane)) return false;
        if (belongsToOtherLane(row.skill.name, family, stackId)) return false;
        if (!row.stackLane) return true;
        if (!stackId) return false;
        return row.stackLane === stackId;
      })
      .map((row) => ({ title: row.skill.name, tags: ['optional'] }));
  }

  private loadCareer(careerSlug: string) {
    return this.prisma.career.findFirst({
      where: { OR: [{ slug: careerSlug }, { id: careerSlug }] },
      include: { requirements: { include: { skill: true } } },
    });
  }

  async learningProgress(userId: string) {
    const goal = await this.prisma.careerGoal.findFirst({
      where: { userId, isActive: true },
      include: { career: true },
    });
    if (!goal) {
      return { career: null, total: 0, known: 0, percent: 0, missing: [] as string[] };
    }

    const ev = await this.evidence.forUser(userId);
    const topics = await this.topicsFor(goal.career.slug, ev.stack);
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: {
        userSkills: { include: { skill: true } },
        certifications: true,
        education: true,
        projects: true,
      },
    });
    const known = new Set(
      [
        ...(profile?.userSkills ?? []).map((s) => s.skill.name.toLowerCase()),
        ...(profile?.certifications ?? []).map((c) => c.name.toLowerCase()),
        ...(profile?.projects ?? []).flatMap((p) => [p.name, ...p.skills]),
      ].filter(Boolean),
    );

    const docs = await this.prisma.document.findMany({
      where: { userId },
      include: { extraction: true },
    });
    for (const d of docs) {
      for (const skill of d.extraction?.skillsDetected ?? []) known.add(skill.toLowerCase());
    }

    const missing: string[] = [];
    let have = 0;
    for (const t of topics) {
      const match = skillMatches(t.title, known);
      if (match) have += 1;
      else missing.push(t.title);
    }

    const total = topics.length || 1;
    return {
      career: goal.career.title,
      slug: goal.career.slug,
      total: topics.length,
      known: have,
      percent: Math.round((have / total) * 100),
      missing: missing.slice(0, 20),
      qualification: profile?.education[0]?.degree ?? null,
    };
  }

  async ensureUserRoadmap(userId: string) {
    return this.rebuildUserRoadmap(userId);
  }

  /** Replace stale advanced "Close the gap" tasks with missing core-intermediate topics. */
  async rebuildUserRoadmap(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (profile?.careerTrack === CareerTrack.GOVERNMENT_EXAM) return null;

    const goal = await this.prisma.careerGoal.findFirst({
      where: { userId, isActive: true },
      include: { career: true },
    });
    if (!goal) return null;

    await this.mergeLayeredRequirements(goal.careerId, familyFromCareer(goal.career));

    const ev = await this.evidence.forUser(userId);
    const stackId = profile?.primaryStack?.trim() || ev.stack;
    const required = await this.topicsFor(goal.career.slug, stackId);
    const stretch = await this.optionalTopics(goal.career.slug, stackId);
    const coreTitles = goal.career.coreTopics ?? [];
    const tier = ev.learnerTier;

    const dedupe = (titles: string[]) =>
      [...new Set(titles.map((t) => t.trim()).filter((t) => t && !isJunkTopic(t) && !skillMatches(t, ev.known)))];

    const bucketFor = (title: string, fallback: 'week' | 'applied'): 'week' | 'applied' | 'later' | 'skip' => {
      const plan = topicPlanForTier(tier, classifyTopic(title, coreTitles), false);
      if (!plan.includeInRequired && !plan.includeInStretch) return 'skip';
      if (plan.includeInStretch) return 'later';
      if (plan.phaseBias === 'd7') return 'week';
      return fallback;
    };

    let week: string[] = [];
    let applied: string[] = [];
    let later: string[] = [];

    if (tier === 'unverified_professional') {
      week = dedupe(baselineProofTopics(goal.career.slug, stackId, coreTitles));
    }

    const weekKeys = () => new Set(week.map((t) => t.toLowerCase()));
    const appliedKeys = () => new Set(applied.map((t) => t.toLowerCase()));

    for (const row of required) {
      const title = row.title.trim();
      if (!title || isJunkTopic(title) || skillMatches(title, ev.known)) continue;
      if (weekKeys().has(title.toLowerCase())) continue;
      const bucket = bucketFor(title, row.tags.includes('core') ? 'week' : 'applied');
      if (bucket === 'skip') continue;
      if (bucket === 'week') week.push(title);
      else if (bucket === 'applied') applied.push(title);
      else later.push(title);
    }

    for (const row of stretch) {
      const title = row.title.trim();
      if (!title || skillMatches(title, ev.known)) continue;
      if (weekKeys().has(title.toLowerCase()) || appliedKeys().has(title.toLowerCase())) continue;
      const plan = topicPlanForTier(tier, classifyTopic(title, coreTitles), false);
      if (plan.includeInStretch || tier === 'early' || tier === 'aspiring') {
        later.push(title);
      }
    }

    week = dedupe(week);
    applied = dedupe(applied.filter((t) => !week.some((w) => w.toLowerCase() === t.toLowerCase())));
    later = dedupe(
      later.filter(
        (t) =>
          !week.some((w) => w.toLowerCase() === t.toLowerCase()) &&
          !applied.some((a) => a.toLowerCase() === t.toLowerCase()),
      ),
    );

    if ((tier === 'early' || tier === 'aspiring') && !applied.length && later.length) {
      const take = Math.min(8, later.length);
      applied = later.slice(0, take);
      later = later.slice(take);
    }

    const marketWhy = new Map<string, string>();
    const marketRows = await this.marketPlanSkills(goal.careerId, ev.known);
    const placed = new Set([...week, ...applied, ...later].map((title) => title.toLowerCase()));
    const marketApplied: string[] = [];
    for (const row of marketRows) {
      const title = row.name.trim();
      if (!title || placed.has(title.toLowerCase())) continue;
      placed.add(title.toLowerCase());
      marketWhy.set(title.toLowerCase(), marketDemandSentence(row));
      if (classifyTopic(title, coreTitles) === 'advanced') later.push(title);
      else marketApplied.push(title);
    }
    applied = [...marketApplied, ...applied];

    const [d60, d90, d180] = splitThirds(later);
    const phased: Array<{ title: string; phase: RoadmapPhase; stretch: boolean }> = [
      ...week.map((title) => ({ title, phase: RoadmapPhase.D7, stretch: false })),
      ...applied.map((title) => ({ title, phase: RoadmapPhase.D30, stretch: false })),
      ...d60.map((title) => ({ title, phase: RoadmapPhase.D60, stretch: true })),
      ...d90.map((title) => ({ title, phase: RoadmapPhase.D90, stretch: true })),
      ...d180.map((title) => ({ title, phase: RoadmapPhase.D180, stretch: true })),
    ];

    let existing = await this.prisma.roadmap.findFirst({
      where: { userId },
      include: { tasks: true },
    });

    if (existing && existing.careerId !== goal.careerId) {
      await this.prisma.roadmap.deleteMany({ where: { userId } });
      existing = null;
    }

    if (!phased.length) {
      if (existing) {
        await this.prisma.roadmapTask.deleteMany({
          where: {
            roadmapId: existing.id,
            status: { not: TaskStatus.COMPLETED },
          },
        });
      }
      return existing;
    }

    const stackName =
      ev.family.lanes.find((item) => item.id === stackId)?.label || ev.stackLabel || goal.career.title;
    const taskPayload = (title: string, index: number, phase: RoadmapPhase, stretch: boolean) => {
      const hours = hoursForTopic(title, stretch);
      const window =
        phase === RoadmapPhase.D7 ? '7 days' : phase === RoadmapPhase.D30 ? '30 days' : 'a later, tougher window';
      return {
        title,
        description: `In ${stackName}, practice ${title} on one real task, including one thing that can go wrong. About ${hours} hours.`,
        why:
          marketWhy.get(title.toLowerCase()) ??
          `${title} belongs in the ${window} plan for ${stackName}. Longer windows ask harder questions.`,
        priority: phase === RoadmapPhase.D7 ? Priority.HIGH : Priority.MEDIUM,
        estimatedEffort: `${hours} hours for this topic`,
        status: TaskStatus.NOT_STARTED,
        relatedSkill: title,
        suggestedResource: stackName,
        phase,
        sortOrder: index + 1,
      };
    };

    if (!existing) {
      return this.prisma.roadmap.create({
        data: {
          userId,
          careerId: goal.careerId,
          title: `${goal.career.title} learning plan`,
          tasks: {
            create: phased.map((row, index) => taskPayload(row.title, index, row.phase, row.stretch)),
          },
        },
      });
    }

    const keep = existing.tasks.filter((t) => {
      if (t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.IN_PROGRESS) return false;
      return phased.some((p) => p.title.toLowerCase() === (t.relatedSkill ?? '').toLowerCase());
    });
    const keepIds = keep.map((t) => t.id);
    const keepTitles = new Set(
      keep.map((t) => ((t.relatedSkill ?? '').trim() || t.title.replace(/^(Close the gap:|Stretch:)\s*/i, '')).toLowerCase()),
    );

    await this.prisma.roadmapTask.deleteMany({
      where: keepIds.length
        ? { roadmapId: existing.id, id: { notIn: keepIds } }
        : { roadmapId: existing.id },
    });

    const toCreate = phased.filter((row) => !keepTitles.has(row.title.toLowerCase()));
    if (toCreate.length) {
      await this.prisma.roadmapTask.createMany({
        data: toCreate.map((row, index) => ({
          roadmapId: existing.id,
          ...taskPayload(row.title, index, row.phase, row.stretch),
        })),
      });
    }

    return this.prisma.roadmap.findFirst({ where: { id: existing.id } });
  }

  private async marketPlanSkills(careerId: string, known: string[]) {
    if (!marketFlags.skillGapField()) return [];
    try {
      const view = await this.marketCompare.compare(careerId, 'all');
      if (!view.period) return [];
      return selectMarketPlanSkills(view.sets.marketOnly, known);
    } catch (err) {
      this.logger.debug(`Market roadmap skills skipped: ${(err as Error).message}`);
      return [];
    }
  }

  private async loadTopics(publicSlug: string, pageUrl: string) {
    const jsonUrls = [`https://roadmap.sh/api/v1-official-roadmap/${publicSlug}`];

    for (const url of jsonUrls) {
      const json = await this.web.fetchJson<unknown>(url);
      const labels = this.labelsFromNodes(this.nodesFrom(json));
      if (labels.length) {
        return labels.map((title) => ({
          title,
          content: `${title} is a syllabus topic (${publicSlug}).`,
        }));
      }
    }

    if (!pageUrl.startsWith('http')) return [];
    try {
      const text = await this.web.fetchText(pageUrl);
      const labels = this.labelsFromPage(text);
      return labels.map((title) => ({
        title,
        content: `${title} is a syllabus topic (${publicSlug}).`,
      }));
    } catch (err) {
      this.logger.warn(`HTML fetch failed ${pageUrl}: ${(err as Error).message}`);
      return [];
    }
  }

  private nodesFrom(json: unknown): RoadmapNode[] {
    if (!json || typeof json !== 'object') return [];
    const row = json as { nodes?: RoadmapNode[]; roadmap?: { nodes?: RoadmapNode[] } };
    if (Array.isArray(row.nodes)) return row.nodes;
    if (Array.isArray(row.roadmap?.nodes)) return row.roadmap.nodes;
    return [];
  }

  private labelsFromNodes(nodes: RoadmapNode[]) {
    const labels = nodes
      .filter((n) => n.type === 'topic' || n.type === 'subtopic' || n.type === 'topics')
      .map((n) => (n.data?.label || n.data?.name || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 1 && t.length < 60 && !/node$/i.test(t) && !isJunkTopic(t));
    return [...new Set(labels)].slice(0, 64);
  }

  private labelsFromPage(text: string) {
    const stop = new Set([
      'roadmap',
      'home',
      'login',
      'signup',
      'guides',
      'videos',
      'about',
      'backend',
      'frontend',
    ]);
    return [...new Set(text.split(/[|/·•,\n]/).map((p) => p.trim()))]
      .filter((p) => p.length > 2 && p.length < 40 && !stop.has(p.toLowerCase()))
      .slice(0, 36);
  }

  private async persistTopics(
    careerSlug: string,
    url: string,
    topics: Array<{ title: string; content: string }>,
    extra: { layer: string; lane?: string; family: string },
  ) {
    const tags = [careerSlug, `layer:${extra.layer}`, `family:${extra.family}`];
    if (extra.lane) tags.push(`lane:${extra.lane}`);
    for (const topic of topics) {
      const existing = await this.prisma.knowledgeChunk.findFirst({
        where: extra.lane
          ? { title: topic.title, tags: { has: `lane:${extra.lane}` } }
          : { source: url, title: topic.title },
      });
      if (existing) {
        await this.prisma.knowledgeChunk.update({
          where: { id: existing.id },
          data: { content: topic.content, tags, source: url },
        });
      } else {
        await this.prisma.knowledgeChunk.create({
          data: {
            title: topic.title,
            content: topic.content,
            source: url,
            tags,
          },
        });
      }
    }

    await this.rag.upsertChunks(
      topics.map((t) => ({
        key: `syllabus:${careerSlug}:${extra.layer}:${extra.lane ?? 'core'}:${t.title.toLowerCase()}`,
        title: `${careerSlug}: ${t.title}`,
        content: t.content,
        kind: extra.layer,
        namespace: 'shared' as const,
        source: url,
        tags,
      })),
    ).catch((err) => this.logger.warn(`RAG skip: ${(err as Error).message}`));
  }

  private async mergeLayeredRequirements(careerId: string, family: RoleFamily) {
    const upsert = async (
      name: string,
      layer: string,
      type: RequirementType,
      importance: Priority,
      stackLane: string | null,
    ) => {
      const skill = await this.prisma.skill.upsert({
        where: { name },
        update: {},
        create: { name, category: layer === 'CORE' ? 'Core' : 'Stack' },
      });
      const existing = await this.prisma.careerSkillRequirement.findFirst({
        where: { careerId, skillId: skill.id, stackLane },
      });
      if (existing) {
        await this.prisma.careerSkillRequirement.update({
          where: { id: existing.id },
          data: { importance, type, layer, stackLane },
        });
      } else {
        await this.prisma.careerSkillRequirement.create({
          data: { careerId, skillId: skill.id, importance, type, layer, stackLane },
        });
      }
    };

    for (const title of family.core) {
      await upsert(title, 'CORE', RequirementType.REQUIRED, Priority.HIGH, null);
    }
    for (const lane of family.lanes) {
      const tagged = await this.prisma.knowledgeChunk.findMany({
        where: { tags: { has: `lane:${lane.id}` } },
        take: 40,
      });
      let requiredCount = 0;
      for (const row of tagged) {
        const name = row.title.slice(0, 80);
        if (isJunkTopic(name)) continue;
        const allowRequired =
          !isAdvancedTopic(name) &&
          isRequiredStackTopic(name, family.core) &&
          row.tags.includes('layer:stack_required') &&
          requiredCount < 8;
        if (allowRequired) requiredCount += 1;
        await upsert(
          name,
          allowRequired ? 'STACK_REQUIRED' : 'OPTIONAL',
          allowRequired ? RequirementType.REQUIRED : RequirementType.RECOMMENDED,
          allowRequired && requiredCount <= 6 ? Priority.HIGH : Priority.MEDIUM,
          lane.id,
        );
      }
    }

    const leftover = await this.prisma.careerSkillRequirement.findMany({
      where: { careerId },
      include: { skill: true },
    });
    for (const row of leftover) {
      if (row.layer === 'CORE') continue;
      if (!isAdvancedTopic(row.skill.name) && isRequiredStackTopic(row.skill.name, family.core) && row.layer === 'STACK_REQUIRED') {
        continue;
      }
      if (row.layer === 'OPTIONAL' && row.type === RequirementType.RECOMMENDED) continue;
      await this.prisma.careerSkillRequirement.update({
        where: { id: row.id },
        data: { layer: 'OPTIONAL', type: RequirementType.RECOMMENDED, importance: Priority.LOW },
      });
    }
  }

  
  documentSkillsSource() {
    return SkillSource.DOCUMENT;
  }
}
