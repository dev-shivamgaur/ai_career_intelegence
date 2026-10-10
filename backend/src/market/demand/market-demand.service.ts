import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { MarketDemandBasis, MarketPeriodType, MarketTrigger, Prisma } from '../../prisma/client';
import { IntelConfigService } from '../../intel-config/intel-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { MarketConsumer, NonRetryableError, type HandlerResult } from '../queue/market-consumer';
import { MarketPublisher } from '../queue/market-publisher.service';
import { MARKET_QUEUES, type MarketMessage } from '../queue/market-queue.constants';
import { MarketScheduler } from '../scheduler/market-scheduler';
import { DEMAND_METHODOLOGY_VERSION, computeDemand, recentPeriods, type Period, type SkillCompanyRow } from './demand-math';

export const BASES: MarketDemandBasis[] = [MarketDemandBasis.NEW_POSTINGS, MarketDemandBasis.ACTIVE_STOCK];
const LOOKBACK: Record<MarketPeriodType, number> = { WEEK: 12, MONTH: 6 };
const GEN_KEY = 'market:demand:gen';

type Window = { start: Date; end: Date };
type Params = { minClassificationConfidence: number; minSkillConfidence: number; companyCapShare: number };
type AfterCareer = (careerId: string, now: Date) => Promise<Record<string, number>>;

function parseEnum<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T, name: string): T {
  if (!value) return fallback;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new BadRequestException({ error: 'INVALID_PARAM', message: `${name} must be one of ${allowed.join(', ')}` });
  }
  return value as T;
}

/**
 * Demand engine. Counts each MarketJob once per (career, lane, period, basis) over the stable panel of the period,
 * keeping only career rows and skill rows above their confidence thresholds, with a per-company cap and a Wilson
 * interval. Snapshots of complete periods are append-only; the open period is replaced until it closes.
 */
@Injectable()
export class MarketDemandService implements OnModuleInit {
  private readonly afterCareer: AfterCareer[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: IntelConfigService,
    private readonly consumer: MarketConsumer,
    private readonly publisher: MarketPublisher,
    private readonly redis: RedisService,
    private readonly scheduler: MarketScheduler,
  ) {}

  onModuleInit() {
    this.consumer.register(MARKET_QUEUES.aggregate, (message) => this.handle(message));
    this.scheduler.registerSlot('aggregate', (windowKey) => this.startAggregateRun('SCHEDULER', windowKey));
  }

  /** Trends (and later cache warm-up) run right after a career's snapshots, inside the same task. */
  registerAfterCareer(hook: AfterCareer) {
    this.afterCareer.push(hook);
  }

  async startAggregateRun(trigger: MarketTrigger, windowKey?: string, careerIds?: string[]) {
    const careers = await this.prisma.marketCareerProfile.findMany({
      where: { enabled: true, ...(careerIds?.length ? { careerId: { in: careerIds } } : {}) },
      select: { careerId: true },
      orderBy: { careerId: 'asc' },
    });
    return this.publisher.startRun(
      'AGGREGATE',
      trigger,
      careers.map((c) => ({ careerId: c.careerId })),
      windowKey,
    );
  }

  async handle(message: MarketMessage): Promise<HandlerResult> {
    const careerId = String(message.payload.careerId ?? '');
    const exists = await this.prisma.career.findUnique({ where: { id: careerId }, select: { id: true } });
    if (!exists) throw new NonRetryableError('CAREER_NOT_FOUND');
    const now = new Date();
    const counters = await this.aggregateCareer(careerId, now);
    for (const hook of this.afterCareer) Object.assign(counters, await hook(careerId, now));
    await this.redis.incr(GEN_KEY);
    return { counters };
  }

  async aggregateCareer(careerId: string, now = new Date()) {
    const params = await this.params();
    const earliest = await this.prisma.marketJob.aggregate({ _min: { firstSeenAt: true } });
    const since = earliest._min.firstSeenAt;
    const counters = { careerSnapshots: 0, skillSnapshots: 0, periodsSkipped: 0 };
    if (!since) return counters;
    const lanes = await this.lanes(careerId, params.minClassificationConfidence);
    for (const type of [MarketPeriodType.WEEK, MarketPeriodType.MONTH]) {
      for (const period of recentPeriods(type, now, LOOKBACK[type]).filter((p) => p.end > since)) {
        const panel = await this.ensurePanel(period, now);
        if (!panel.length) continue;
        const companies = [...new Set(panel.map((p) => p.companyId))];
        for (const basis of BASES) {
          for (const laneKey of lanes) {
            const written = await this.writeSnapshot(careerId, laneKey, basis, period, panel.length, companies, params, now);
            if (written === null) counters.periodsSkipped += 1;
            else {
              counters.careerSnapshots += 1;
              counters.skillSnapshots += written;
            }
          }
        }
      }
    }
    return counters;
  }

  /** Returns the number of skill rows written, or null when the complete snapshot already exists (append-only). */
  private async writeSnapshot(
    careerId: string,
    laneKey: string,
    basis: MarketDemandBasis,
    period: Period,
    panelSources: number,
    panelCompanies: string[],
    params: Params,
    now: Date,
  ): Promise<number | null> {
    const key = { periodType: period.type, periodStart: period.start, basis, careerId, laneKey, methodologyVersion: DEMAND_METHODOLOGY_VERSION };
    const existing = await this.prisma.marketCareerSnapshot.findUnique({
      where: { periodType_periodStart_basis_careerId_laneKey_methodologyVersion: key },
      select: { isComplete: true },
    });
    if (existing?.isComplete) return null;
    const d = await this.compute(careerId, laneKey, basis, period, panelCompanies, params);
    const names = new Map(
      (await this.prisma.skill.findMany({ where: { id: { in: d.skills.map((s) => s.skillId) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]),
    );
    const isComplete = period.end <= now;
    const base = { periodType: period.type, periodStart: period.start, periodEnd: period.end, basis, careerId, laneKey, methodologyVersion: DEMAND_METHODOLOGY_VERSION, isComplete, computedAt: now };
    await this.prisma.$transaction([
      this.prisma.marketSkillSnapshot.deleteMany({ where: { ...key } }),
      this.prisma.marketCareerSnapshot.deleteMany({ where: { ...key } }),
      this.prisma.marketCareerSnapshot.create({
        data: {
          ...base,
          totalJobs: d.totalJobs,
          cappedTotal: d.cappedTotal,
          companyCount: d.companyCount,
          capJobs: d.capJobs,
          panelSources,
          panelCompanies: panelCompanies.length,
          params: params as Prisma.InputJsonValue,
        },
      }),
      this.prisma.marketSkillSnapshot.createMany({
        data: d.skills.map((s) => ({
          ...base,
          ...s,
          skillName: names.get(s.skillId) ?? s.skillId,
          totalJobs: d.totalJobs,
          cappedTotal: d.cappedTotal,
          panelCompanies: panelCompanies.length,
        })),
      }),
    ]);
    return d.skills.length;
  }

  /** Population and per-skill counts for one window. Shared by snapshots and the live "current demand" view. */
  async compute(careerId: string, laneKey: string, basis: MarketDemandBasis, w: Window, panelCompanies: string[], params: Params) {
    if (!panelCompanies.length) return computeDemand(new Map(), [], params.companyCapShare);
    const inBasis =
      basis === MarketDemandBasis.NEW_POSTINGS
        ? Prisma.sql`j."firstSeenAt" >= ${w.start} AND j."firstSeenAt" < ${w.end}`
        : Prisma.sql`j."firstSeenAt" < ${w.end} AND COALESCE(j."closedAt", j."lastSeenAt") >= ${w.start}`;
    const pop = Prisma.sql`
      SELECT DISTINCT j.id, j."companyId"
      FROM "market_job" j JOIN "market_job_career" c ON c."marketJobId" = j.id
      WHERE c."careerId" = ${careerId} AND c."laneKey" = ${laneKey} AND c.confidence >= ${params.minClassificationConfidence}
        AND j."companyId" IN (${Prisma.join(panelCompanies)}) AND ${inBasis}`;
    const [perCompany, rows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ companyId: string; n: number }>>`
        SELECT pop."companyId", COUNT(*)::int AS n FROM (${pop}) pop GROUP BY pop."companyId"`,
      this.prisma.$queryRaw<SkillCompanyRow[]>`
        WITH pop AS (${pop}),
        per_job AS (
          SELECT s."skillId", pop."companyId", pop.id,
                 MAX(CASE s.level WHEN 'REQUIRED' THEN 3 WHEN 'RECOMMENDED' THEN 2 ELSE 1 END) AS lvl
          FROM "market_job_skill" s JOIN pop ON pop.id = s."marketJobId"
          WHERE s."skillId" IS NOT NULL AND s.confidence >= ${params.minSkillConfidence}
          GROUP BY s."skillId", pop."companyId", pop.id
        )
        SELECT "skillId", "companyId", COUNT(*)::int AS jobs,
               COUNT(*) FILTER (WHERE lvl = 3)::int AS required,
               COUNT(*) FILTER (WHERE lvl = 2)::int AS preferred,
               COUNT(*) FILTER (WHERE lvl = 1)::int AS nice
        FROM per_job GROUP BY "skillId", "companyId"`,
    ]);
    return computeDemand(new Map(perCompany.map((r) => [r.companyId, r.n])), rows, params.companyCapShare);
  }

  /** Sources with a completed fetch inside the period. Frozen once computed after the period closed. */
  async ensurePanel(period: Period, now: Date) {
    const where = { periodType: period.type, periodStart: period.start };
    const existing = await this.prisma.marketPanelMembership.findMany({ where });
    if (existing.length && existing.every((m) => m.computedAt >= period.end)) return existing;
    const rows = await this.panelFor(period);
    await this.prisma.$transaction([
      this.prisma.marketPanelMembership.deleteMany({ where }),
      this.prisma.marketPanelMembership.createMany({
        data: rows.map((r) => ({ ...where, periodEnd: period.end, ...r, computedAt: now })),
      }),
    ]);
    return this.prisma.marketPanelMembership.findMany({ where });
  }

  private panelFor(w: Window) {
    return this.prisma.$queryRaw<Array<{ sourceId: string; companyId: string; successfulFetches: number; firstSuccessAt: Date; lastSuccessAt: Date }>>`
      SELECT t."sourceId", s."companyId", COUNT(*)::int AS "successfulFetches",
             MIN(t."finishedAt") AS "firstSuccessAt", MAX(t."finishedAt") AS "lastSuccessAt"
      FROM "market_task" t JOIN "market_source" s ON s.id = t."sourceId"
      WHERE t.kind = 'FETCH' AND t.status = 'COMPLETED' AND t."finishedAt" >= ${w.start} AND t."finishedAt" < ${w.end}
      GROUP BY t."sourceId", s."companyId"`;
  }

  private async lanes(careerId: string, minConf: number) {
    const rows = await this.prisma.$queryRaw<Array<{ laneKey: string }>>`
      SELECT DISTINCT "laneKey" FROM "market_job_career"
      WHERE "careerId" = ${careerId} AND "laneKey" <> 'all' AND confidence >= ${minConf} ORDER BY "laneKey"`;
    return ['all', ...rows.map((r) => r.laneKey)];
  }

  private async params(): Promise<Params> {
    const d = await this.config.get('demand');
    return { minClassificationConfidence: d.minClassificationConfidence, minSkillConfidence: d.minSkillConfidence, companyCapShare: d.companyCapShare };
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const gen = (await this.redis.get(GEN_KEY)) ?? '0';
    const full = `market:demand:${gen}:${key}`;
    const hit = await this.redis.get(full);
    if (hit) return JSON.parse(hit) as T;
    const value = await load();
    await this.redis.set(full, JSON.stringify(value), (await this.config.get('demand')).cacheTtlSeconds);
    return value;
  }

  private async career(careerId: string) {
    const career = await this.prisma.career.findUnique({ where: { id: careerId }, select: { id: true, title: true, slug: true } });
    if (!career) throw new NotFoundException({ error: 'CAREER_NOT_FOUND', message: 'Career not found' });
    return career;
  }

  /** Snapshot periods available for a career, newest first. */
  async periods(careerId: string, q: { periodType?: string; basis?: string; lane?: string }) {
    const periodType = parseEnum(q.periodType, ['WEEK', 'MONTH'] as const, 'MONTH', 'periodType');
    const basis = parseEnum(q.basis, BASES, MarketDemandBasis.ACTIVE_STOCK, 'basis');
    await this.career(careerId);
    return this.prisma.marketCareerSnapshot.findMany({
      where: { careerId, laneKey: q.lane || 'all', periodType, basis, methodologyVersion: DEMAND_METHODOLOGY_VERSION },
      orderBy: { periodStart: 'desc' },
      select: { periodStart: true, periodEnd: true, isComplete: true, totalJobs: true, companyCount: true, panelCompanies: true, computedAt: true },
    });
  }

  /** One snapshot (latest by default) with every statistic carrying n, companies, panel, period and confidence. */
  async careerDemand(careerId: string, q: { periodType?: string; basis?: string; lane?: string; periodStart?: string; take?: number }) {
    const periodType = parseEnum(q.periodType, ['WEEK', 'MONTH'] as const, 'MONTH', 'periodType');
    const basis = parseEnum(q.basis, BASES, MarketDemandBasis.ACTIVE_STOCK, 'basis');
    const laneKey = q.lane || 'all';
    const take = Math.min(Math.max(q.take ?? 50, 1), 200);
    let periodStart: Date | undefined;
    if (q.periodStart) {
      periodStart = new Date(q.periodStart);
      if (Number.isNaN(periodStart.getTime())) throw new BadRequestException({ error: 'INVALID_PARAM', message: 'periodStart must be an ISO date' });
    }
    const career = await this.career(careerId);
    return this.cached(`snap:${careerId}:${laneKey}:${periodType}:${basis}:${periodStart?.toISOString() ?? 'latest'}:${take}`, async () => {
      const where = { careerId, laneKey, periodType, basis, methodologyVersion: DEMAND_METHODOLOGY_VERSION, ...(periodStart ? { periodStart } : {}) };
      const [snap, laneRows] = await Promise.all([
        this.prisma.marketCareerSnapshot.findFirst({ where, orderBy: { periodStart: 'desc' } }),
        this.prisma.marketCareerSnapshot.findMany({
          where: { careerId, periodType, basis, methodologyVersion: DEMAND_METHODOLOGY_VERSION },
          distinct: ['laneKey'],
          select: { laneKey: true },
          orderBy: { laneKey: 'asc' },
        }),
      ]);
      const lanes = laneRows.map((r) => r.laneKey);
      if (!snap) return { career, lane: laneKey, lanes, periodType, basis, snapshot: null, skills: [] };
      const skills = await this.prisma.marketSkillSnapshot.findMany({
        where: { careerId, laneKey, periodType, basis, periodStart: snap.periodStart, methodologyVersion: DEMAND_METHODOLOGY_VERSION },
        orderBy: [{ cappedJobCount: 'desc' }, { skillName: 'asc' }],
        take,
      });
      const provenance = {
        n: snap.totalJobs,
        cappedN: snap.cappedTotal,
        companies: snap.companyCount,
        panel: { sources: snap.panelSources, companies: snap.panelCompanies },
        period: { type: snap.periodType, start: snap.periodStart, end: snap.periodEnd, complete: snap.isComplete },
        basis: snap.basis,
        methodologyVersion: snap.methodologyVersion,
        computedAt: snap.computedAt,
      };
      return {
        career,
        lane: laneKey,
        lanes,
        periodType,
        basis,
        snapshot: { ...provenance, capJobs: snap.capJobs, params: snap.params },
        skills: skills.map((s) => ({
          skillId: s.skillId,
          name: s.skillName,
          jobCount: s.jobCount,
          requiredCount: s.requiredCount,
          preferredCount: s.preferredCount,
          niceCount: s.niceCount,
          cappedJobCount: s.cappedJobCount,
          demandPct: s.demandPct,
          companies: s.companyCount,
          confidence: { method: 'wilson95', lower: s.wilsonLower, upper: s.wilsonUpper },
          n: s.totalJobs,
          panelCompanies: s.panelCompanies,
          period: provenance.period,
        })),
      };
    });
  }

  /** Rolling "current demand" over the last activeStockWindowDays of active stock. Display only; never used for trends. */
  async currentDemand(careerId: string, q: { lane?: string; take?: number }, now = new Date()) {
    const laneKey = q.lane || 'all';
    const take = Math.min(Math.max(q.take ?? 50, 1), 200);
    const career = await this.career(careerId);
    const { activeStockWindowDays } = await this.config.get('demand');
    return this.cached(`current:${careerId}:${laneKey}:${take}`, async () => {
      const params = await this.params();
      const w = { start: new Date(now.getTime() - activeStockWindowDays * 24 * 60 * 60 * 1000), end: now };
      const panel = await this.panelFor(w);
      const companies = [...new Set(panel.map((p) => p.companyId))];
      const d = await this.compute(careerId, laneKey, MarketDemandBasis.ACTIVE_STOCK, w, companies, params);
      const names = new Map(
        (await this.prisma.skill.findMany({ where: { id: { in: d.skills.map((s) => s.skillId) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]),
      );
      const period = { type: 'ROLLING', start: w.start, end: w.end, days: activeStockWindowDays, complete: false };
      return {
        career,
        lane: laneKey,
        basis: MarketDemandBasis.ACTIVE_STOCK,
        snapshot: {
          n: d.totalJobs,
          cappedN: d.cappedTotal,
          companies: d.companyCount,
          panel: { sources: panel.length, companies: companies.length },
          period,
          basis: MarketDemandBasis.ACTIVE_STOCK,
          methodologyVersion: DEMAND_METHODOLOGY_VERSION,
          computedAt: now,
          capJobs: d.capJobs,
          params,
        },
        skills: d.skills.slice(0, take).map((s) => ({
          skillId: s.skillId,
          name: names.get(s.skillId) ?? s.skillId,
          jobCount: s.jobCount,
          requiredCount: s.requiredCount,
          preferredCount: s.preferredCount,
          niceCount: s.niceCount,
          cappedJobCount: s.cappedJobCount,
          demandPct: s.demandPct,
          companies: s.companyCount,
          confidence: { method: 'wilson95', lower: s.wilsonLower, upper: s.wilsonUpper },
          n: d.totalJobs,
          panelCompanies: companies.length,
          period,
        })),
      };
    });
  }

  panel(periodType: string | undefined, periodStart: string | undefined) {
    const type = parseEnum(periodType, ['WEEK', 'MONTH'] as const, 'MONTH', 'periodType');
    const start = periodStart ? new Date(periodStart) : undefined;
    if (start && Number.isNaN(start.getTime())) throw new BadRequestException({ error: 'INVALID_PARAM', message: 'periodStart must be an ISO date' });
    return this.prisma.marketPanelMembership.findMany({
      where: { periodType: type, ...(start ? { periodStart: start } : {}) },
      orderBy: [{ periodStart: 'desc' }, { sourceId: 'asc' }],
      take: 500,
    });
  }
}
