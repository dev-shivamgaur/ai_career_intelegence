import { Injectable, OnModuleInit } from '@nestjs/common';
import { MarketClassificationStatus, MarketClassifyMethod, MarketProcessingStatus } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { MarketStage, StageContext, StageRow } from '../process/market-stage';
import { MarketProcessService } from '../process/market-process.service';
import { CLASSIFIER_VERSION, classifyTitle, type CareerPatterns } from './title-classifier';

/**
 * EXTRACTED -> DONE. Classifies the linked MarketJob by title patterns only (M6).
 * Admin assignments are kept; pattern assignments are replaced, so re-running is idempotent.
 */
@Injectable()
export class ClassifyStage implements MarketStage, OnModuleInit {
  readonly name = 'classify';
  readonly from = MarketProcessingStatus.EXTRACTED;
  readonly to = MarketProcessingStatus.DONE;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: MarketProcessService,
  ) {}

  onModuleInit() {
    this.pipeline.registerStage(this);
  }

  async run(row: StageRow, ctx: StageContext) {
    if (!row.marketJobId) throw new Error('Raw job has no MarketJob (dedupe did not run)');
    const done = (ctx.cache.get('classify:done') as Set<string> | undefined) ?? new Set<string>();
    ctx.cache.set('classify:done', done);
    if (done.has(row.marketJobId)) return;
    done.add(row.marketJobId);

    const [job, careers] = await Promise.all([
      this.prisma.marketJob.findUniqueOrThrow({ where: { id: row.marketJobId }, select: { title: true, normalizedTitle: true } }),
      this.careers(ctx),
    ]);
    const matches = classifyTitle(job.title, job.normalizedTitle, careers);
    const admin = await this.prisma.marketJobCareer.findMany({
      where: { marketJobId: row.marketJobId, method: MarketClassifyMethod.ADMIN },
      select: { careerId: true },
    });
    const adminRows = admin.length;
    const adminCareers = new Set(admin.map((r) => r.careerId));
    const fresh = matches.filter((m) => !adminCareers.has(m.careerId));

    await this.prisma.$transaction([
      this.prisma.marketJobCareer.deleteMany({
        where: { marketJobId: row.marketJobId, method: { not: MarketClassifyMethod.ADMIN } },
      }),
      this.prisma.marketJobCareer.createMany({
        data: fresh.map((m) => ({
          marketJobId: row.marketJobId!,
          careerId: m.careerId,
          laneKey: 'all',
          confidence: m.confidence,
          method: MarketClassifyMethod.TITLE_PATTERN,
          isPrimary: m.isPrimary && adminRows === 0,
          matchedPattern: m.matchedPattern,
          classifierVersion: CLASSIFIER_VERSION,
        })),
      }),
      this.prisma.marketJob.update({
        where: { id: row.marketJobId },
        data: {
          classificationStatus:
            matches.length || adminRows ? MarketClassificationStatus.CLASSIFIED : MarketClassificationStatus.UNCLASSIFIED,
          classifierVersion: CLASSIFIER_VERSION,
          classifiedAt: ctx.now,
        },
      }),
    ]);
    const counters = (ctx.cache.get('counters') as Record<string, number> | undefined) ?? {};
    const key = matches.length || adminRows ? 'jobsClassified' : 'jobsUnclassified';
    counters[key] = (counters[key] ?? 0) + 1;
    ctx.cache.set('counters', counters);
  }

  private async careers(ctx: StageContext): Promise<CareerPatterns[]> {
    const key = 'classify:careers';
    if (!ctx.cache.has(key)) {
      const profiles = await this.prisma.marketCareerProfile.findMany({
        where: { enabled: true },
        select: { careerId: true, titlePatterns: true, excludePatterns: true },
        orderBy: { careerId: 'asc' },
      });
      ctx.cache.set(key, profiles);
    }
    return ctx.cache.get(key) as CareerPatterns[];
  }
}
