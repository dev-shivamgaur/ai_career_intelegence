import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { MarketDemandBasis, MarketPeriodType } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { DEMAND_METHODOLOGY_VERSION } from '../demand/demand-math';
import { MarketDemandService } from '../demand/market-demand.service';
import { TREND_METHODOLOGY_VERSION } from '../trend/trend-math';
import { compareRoadmapMarket, type CompareSets, type MarketSkill, type RoadmapSkill, type TrendHit } from './compare';

const GEN_KEY = 'market:demand:gen';

export type CompareView = {
  career: { id: string; title: string; slug: string };
  lane: string;
  basis: 'ACTIVE_STOCK';
  period: { start: string; end: string; complete: boolean } | null;
  methodology: { demand: string; trend: string };
  sets: CompareSets;
};

/**
 * Roadmap requirements versus the latest monthly active-stock snapshot.
 * Reading never writes CareerSkillRequirement. Promote is the only writer, and it sets source=ADMIN.
 */
@Injectable()
export class MarketCompareService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly demand: MarketDemandService,
  ) {}

  onModuleInit() {
    this.demand.registerAfterCareer(async (careerId) => {
      await this.compare(careerId, 'all');
      return { compareWarmed: 1 };
    });
  }

  async compare(careerId: string, lane = 'all'): Promise<CompareView> {
    const career = await this.prisma.career.findUnique({ where: { id: careerId }, select: { id: true, title: true, slug: true } });
    if (!career) throw new NotFoundException({ error: 'CAREER_NOT_FOUND', message: 'Career not found' });
    const laneKey = lane || 'all';
    return this.cached(`rvm:${career.id}:${laneKey}`, () => this.build(career, laneKey));
  }

  async compareBySlug(slug: string, lane = 'all') {
    const career = await this.prisma.career.findUnique({ where: { slug }, select: { id: true } });
    if (!career) throw new NotFoundException({ error: 'CAREER_NOT_FOUND', message: 'Career not found' });
    return this.compare(career.id, lane);
  }

  /** Latest active-stock figures for the given skills, used to annotate skill-gap items. */
  async marketBySkill(careerId: string, skillIds: string[]) {
    if (!skillIds.length) return new Map<string, ComparedMarket>();
    const view = await this.compare(careerId, 'all');
    const all = [...view.sets.overlap, ...view.sets.marketOnly, ...view.sets.roadmapOnly];
    const wanted = new Set(skillIds);
    const out = new Map<string, ComparedMarket>();
    for (const row of all) {
      if (!wanted.has(row.skillId) || row.demandPct === null) continue;
      out.set(row.skillId, {
        demandPct: row.demandPct,
        jobCount: row.jobCount,
        companies: row.companies,
        n: row.n,
        wilsonLower: row.wilsonLower,
        trend: row.trend,
        period: view.period,
      });
    }
    return out;
  }

  /**
   * Admin-only. Inserts a requirement the market sees but the roadmap does not, with source=ADMIN.
   * An existing requirement is left unchanged except source/sourceRef/lastSeenAt.
   */
  async promote(careerId: string, skillId: string, actorId: string) {
    const skill = await this.prisma.skill.findUnique({ where: { id: skillId }, select: { id: true, name: true } });
    if (!skill) throw new NotFoundException({ error: 'SKILL_NOT_FOUND', message: 'Skill not found' });
    const career = await this.prisma.career.findUnique({ where: { id: careerId }, select: { id: true } });
    if (!career) throw new NotFoundException({ error: 'CAREER_NOT_FOUND', message: 'Career not found' });
    const existing = await this.prisma.careerSkillRequirement.findFirst({
      where: { careerId, skillId, stackLane: null },
    });
    if (existing && existing.source === 'ADMIN') {
      throw new ConflictException({ error: 'ALREADY_PROMOTED', message: `${skill.name} is already an admin requirement` });
    }
    const data = { source: 'ADMIN', sourceRef: actorId, lastSeenAt: new Date() };
    const row = existing
      ? await this.prisma.careerSkillRequirement.update({ where: { id: existing.id }, data })
      : await this.prisma.careerSkillRequirement.create({
          data: {
            careerId,
            skillId,
            importance: 'MEDIUM',
            type: 'RECOMMENDED',
            layer: 'CORE',
            stackLane: null,
            ...data,
          },
        });
    await this.redis.incr(GEN_KEY);
    return { id: row.id, skillId, source: row.source, created: !existing };
  }

  private async build(career: { id: string; title: string; slug: string }, laneKey: string): Promise<CompareView> {
    const snap = await this.prisma.marketCareerSnapshot.findFirst({
      where: {
        careerId: career.id,
        laneKey,
        basis: MarketDemandBasis.ACTIVE_STOCK,
        periodType: MarketPeriodType.MONTH,
        methodologyVersion: DEMAND_METHODOLOGY_VERSION,
      },
      orderBy: { periodStart: 'desc' },
    });
    const [requirements, skills, trendRows] = await Promise.all([
      this.prisma.careerSkillRequirement.findMany({
        where: {
          careerId: career.id,
          ...(laneKey === 'all' ? {} : { OR: [{ stackLane: null }, { stackLane: laneKey }] }),
        },
        include: { skill: { select: { id: true, name: true } } },
      }),
      snap
        ? this.prisma.marketSkillSnapshot.findMany({
            where: {
              careerId: career.id,
              laneKey,
              basis: MarketDemandBasis.ACTIVE_STOCK,
              periodType: MarketPeriodType.MONTH,
              periodStart: snap.periodStart,
              methodologyVersion: DEMAND_METHODOLOGY_VERSION,
            },
          })
        : Promise.resolve([]),
      this.prisma.skillTrend.findMany({
        where: { careerId: career.id, laneKey, periodType: MarketPeriodType.MONTH, methodologyVersion: TREND_METHODOLOGY_VERSION },
        orderBy: { periodStart: 'desc' },
        take: 200,
      }),
    ]);
    const latestTrendStart = trendRows[0]?.periodStart.getTime();
    const trends: TrendHit[] = trendRows
      .filter((t) => t.periodStart.getTime() === latestTrendStart)
      .map((t) => ({ skillId: t.skillId, label: t.label }));
    const roadmap: RoadmapSkill[] = requirements.map((r) => ({
      skillId: r.skillId,
      name: r.skill.name,
      importance: r.importance,
      type: r.type,
    }));
    const market: MarketSkill[] = skills.map((s) => ({
      skillId: s.skillId,
      name: s.skillName,
      demandPct: s.demandPct,
      jobCount: s.jobCount,
      companies: s.companyCount,
      n: s.totalJobs,
      wilsonLower: s.wilsonLower,
    }));
    return {
      career,
      lane: laneKey,
      basis: 'ACTIVE_STOCK',
      period: snap ? { start: snap.periodStart.toISOString(), end: snap.periodEnd.toISOString(), complete: snap.isComplete } : null,
      methodology: { demand: DEMAND_METHODOLOGY_VERSION, trend: TREND_METHODOLOGY_VERSION },
      sets: compareRoadmapMarket(roadmap, market, trends),
    };
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const gen = (await this.redis.get(GEN_KEY)) ?? '0';
    const full = `market:demand:${gen}:${key}`;
    const hit = await this.redis.get(full);
    if (hit) return JSON.parse(hit) as T;
    const value = await load();
    await this.redis.set(full, JSON.stringify(value), 3600);
    return value;
  }
}

type ComparedMarket = {
  demandPct: number | null;
  jobCount: number | null;
  companies: number | null;
  n: number | null;
  wilsonLower: number | null;
  trend: string | null;
  period: CompareView['period'];
};
