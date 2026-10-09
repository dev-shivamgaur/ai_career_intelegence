import { Injectable, OnModuleInit } from '@nestjs/common';
import { MarketClassificationStatus, MarketClassifyMethod, MarketProcessingStatus, Prisma } from '../../prisma/client';
import { parseLanes } from '../../ai/stack-lanes';
import { IntelConfigService } from '../../intel-config/intel-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { MarketStage, StageContext, StageRow } from '../process/market-stage';
import { MarketProcessService } from '../process/market-process.service';
import { CareerLlmClassifier } from './career-llm.service';
import { CAREER_CLASSIFIER_VERSION, isAmbiguous, scoreCareers, type CareerModel } from './career-scorer';

type Row = Prisma.MarketJobCareerCreateManyInput;

/**
 * EXTRACTED -> DONE. Scores careers by title pattern and skill overlap, assigns lanes, and asks the LLM only when the
 * job is ambiguous. Every candidate is stored with its confidence; demand counts only rows at or above
 * demand.minClassificationConfidence. Admin assignments are kept; everything else is replaced, so re-runs are idempotent.
 */
@Injectable()
export class ClassifyStage implements MarketStage, OnModuleInit {
  readonly name = 'classify';
  readonly from = MarketProcessingStatus.EXTRACTED;
  readonly to = MarketProcessingStatus.DONE;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: MarketProcessService,
    private readonly config: IntelConfigService,
    private readonly llm: CareerLlmClassifier,
  ) {}

  onModuleInit() {
    this.pipeline.registerStage(this);
  }

  async run(row: StageRow, ctx: StageContext) {
    if (!row.marketJobId) throw new Error('Raw job has no MarketJob (dedupe did not run)');
    const marketJobId = row.marketJobId;
    const done = (ctx.cache.get('classify:done') as Set<string> | undefined) ?? new Set<string>();
    ctx.cache.set('classify:done', done);
    if (done.has(marketJobId)) return;
    done.add(marketJobId);

    const [job, careers, cls, demand] = await Promise.all([
      this.prisma.marketJob.findUniqueOrThrow({
        where: { id: marketJobId },
        select: {
          title: true,
          normalizedTitle: true,
          skills: { select: { skillId: true, rawName: true, confidence: true, skill: { select: { name: true } } } },
        },
      }),
      this.careers(ctx),
      this.config.get('classification'),
      this.config.get('demand'),
    ]);
    const skills = job.skills
      .filter((s) => s.confidence >= demand.minSkillConfidence)
      .map((s) => ({ skillId: s.skillId, name: s.skill?.name ?? s.rawName }));
    const scores = scoreCareers({ title: job.title, normalizedTitle: job.normalizedTitle, skills }, careers, cls);

    const admin = await this.prisma.marketJobCareer.findMany({
      where: { marketJobId, method: MarketClassifyMethod.ADMIN },
      select: { careerId: true },
    });
    const adminCareers = new Set(admin.map((r) => r.careerId));
    const rows: Row[] = [];
    const add = (careerId: string, laneKey: string, confidence: number, method: MarketClassifyMethod, matchedPattern: string | null) => {
      if (!adminCareers.has(careerId)) {
        rows.push({ marketJobId, careerId, laneKey, confidence, method, isPrimary: false, matchedPattern, classifierVersion: CAREER_CLASSIFIER_VERSION });
      }
    };

    let llmUsed = false;
    if (isAmbiguous(scores, cls.minConfidence)) {
      const candidates = scores.map((s) => ({ slug: s.slug, title: careers.find((c) => c.careerId === s.careerId)?.title ?? s.slug }));
      const choice = await this.llm.choose({ title: job.title, skills: skills.map((s) => s.name) }, candidates);
      if (choice) {
        llmUsed = true;
        for (const s of scores) {
          if (!choice.slugs.includes(s.slug)) continue;
          s.confidence = choice.confidence;
          add(s.careerId, 'all', choice.confidence, MarketClassifyMethod.LLM, s.titleMatch);
          if (choice.confidence >= cls.minConfidence) for (const lane of s.lanes) add(s.careerId, lane, choice.confidence, MarketClassifyMethod.LLM, null);
        }
      }
    }
    if (!llmUsed) {
      for (const s of scores) {
        const method = s.method === 'TITLE_PATTERN' ? MarketClassifyMethod.TITLE_PATTERN : MarketClassifyMethod.SKILL_OVERLAP;
        add(s.careerId, 'all', s.confidence, method, s.titleMatch);
        if (s.confidence >= cls.minConfidence) for (const lane of s.lanes) add(s.careerId, lane, s.confidence, method, null);
      }
    }
    const confident = rows.filter((r) => r.laneKey === 'all' && r.confidence >= cls.minConfidence).sort((a, b) => b.confidence - a.confidence);
    if (confident.length && !admin.length) confident[0].isPrimary = true;
    const classified = confident.length > 0 || admin.length > 0;

    await this.prisma.$transaction([
      this.prisma.marketJobCareer.deleteMany({ where: { marketJobId, method: { not: MarketClassifyMethod.ADMIN } } }),
      this.prisma.marketJobCareer.createMany({ data: rows, skipDuplicates: true }),
      this.prisma.marketJob.update({
        where: { id: marketJobId },
        data: {
          classificationStatus: classified ? MarketClassificationStatus.CLASSIFIED : MarketClassificationStatus.UNCLASSIFIED,
          classifierVersion: CAREER_CLASSIFIER_VERSION,
          classifiedAt: ctx.now,
        },
      }),
    ]);
    const counters = (ctx.cache.get('counters') as Record<string, number> | undefined) ?? {};
    const key = classified ? 'jobsClassified' : 'jobsUnclassified';
    counters[key] = (counters[key] ?? 0) + 1;
    if (llmUsed) counters.classifyLlm = (counters.classifyLlm ?? 0) + 1;
    ctx.cache.set('counters', counters);
  }

  private async careers(ctx: StageContext): Promise<CareerModel[]> {
    const key = 'classify:careers';
    if (!ctx.cache.has(key)) {
      const profiles = await this.prisma.marketCareerProfile.findMany({
        where: { enabled: true },
        orderBy: { careerId: 'asc' },
        select: {
          careerId: true,
          titlePatterns: true,
          excludePatterns: true,
          career: { select: { slug: true, title: true, stackLanes: true, requirements: { select: { skillId: true } } } },
        },
      });
      ctx.cache.set(
        key,
        profiles.map((p) => ({
          careerId: p.careerId,
          slug: p.career.slug,
          title: p.career.title,
          titlePatterns: p.titlePatterns,
          excludePatterns: p.excludePatterns,
          skillIds: new Set(p.career.requirements.map((r) => r.skillId)),
          lanes: parseLanes(p.career.stackLanes),
        })),
      );
    }
    return ctx.cache.get(key) as CareerModel[];
  }
}