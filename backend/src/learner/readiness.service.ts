import { Injectable, NotFoundException } from '@nestjs/common';
import { MarketDemandBasis, MarketPeriodType } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEMAND_METHODOLOGY_VERSION } from '../market/demand/demand-math';
import { MarketCompareService } from '../market/compare/market-compare.service';
import { isMet, marketTieBreakAllowed, orderGaps, readinessScore, type GapRow } from './readiness-math';

@Injectable()
export class ReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compare: MarketCompareService,
  ) {}

  async forUser(userId: string) {
    const goal = await this.prisma.careerGoal.findFirst({
      where: { userId, isActive: true },
      include: { career: { select: { id: true, title: true, slug: true } } },
    });
    if (!goal) throw new NotFoundException({ error: 'GOAL_NOT_FOUND', message: 'Active career goal required' });
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { id: true } });
    const requirements = await this.prisma.careerSkillRequirement.findMany({
      where: { careerId: goal.careerId, layer: { in: ['CORE', 'STACK_REQUIRED'] } },
      include: { skill: { select: { id: true, name: true, domainId: true, domain: { select: { key: true, label: true } } } } },
    });
    const summaries = profile
      ? await this.prisma.skillEvidenceSummary.findMany({ where: { profileId: profile.id } })
      : [];
    const statusOf = new Map(summaries.map((row) => [row.skillId, row.status]));
    const relations = await this.prisma.skillRelation.findMany({
      where: { kind: 'PREREQUISITE', skillId: { in: requirements.map((r) => r.skillId) } },
    });
    const prereqOf = new Map<string, string[]>();
    for (const rel of relations) {
      const list = prereqOf.get(rel.skillId) ?? [];
      list.push(rel.relatedSkillId);
      prereqOf.set(rel.skillId, list);
    }

    const required = requirements.filter((r) => r.type === 'REQUIRED' || r.importance === 'HIGH');
    const requiredMet = required.filter((r) => isMet(statusOf.get(r.skillId))).length;
    const foundationIds = [...new Set(relations.map((r) => r.relatedSkillId))];
    const foundationMet = foundationIds.filter((id) => isMet(statusOf.get(id))).length;
    const score = readinessScore(requiredMet, required.length, foundationMet, foundationIds.length);

    let marketEligible = false;
    let marketContext: {
      share: Array<{ skillId: string; demandPct: number }>;
      period: { start: string; end: string; complete: boolean } | null;
      n: number | null;
      companies: number | null;
      basis: string;
    } = {
      share: [],
      period: null,
      n: null,
      companies: null,
      basis: 'ACTIVE_STOCK',
    };
    const share = new Map<string, number>();
    try {
      const view = await this.compare.compare(goal.careerId, 'all');
      const snap = await this.prisma.marketCareerSnapshot.findFirst({
        where: {
          careerId: goal.careerId,
          laneKey: 'all',
          basis: MarketDemandBasis.ACTIVE_STOCK,
          periodType: MarketPeriodType.MONTH,
          methodologyVersion: DEMAND_METHODOLOGY_VERSION,
          ...(view.period ? { periodStart: new Date(view.period.start) } : {}),
        },
      });
      marketEligible = marketTieBreakAllowed(snap?.totalJobs ?? 0, snap?.companyCount ?? 0);
      for (const row of [...view.sets.overlap, ...view.sets.marketOnly, ...view.sets.roadmapOnly]) {
        if (row.demandPct !== null) share.set(row.skillId, row.demandPct);
      }
      marketContext = {
        share: [...share.entries()].map(([skillId, demandPct]) => ({ skillId, demandPct })),
        period: view.period,
        n: snap?.totalJobs ?? null,
        companies: snap?.companyCount ?? null,
        basis: 'ACTIVE_STOCK',
      };
    } catch {
      marketEligible = false;
    }

    const gaps: GapRow[] = requirements
      .filter((r) => !isMet(statusOf.get(r.skillId)))
      .map((r) => ({
        skillId: r.skillId,
        name: r.skill.name,
        importance: r.importance,
        type: r.type,
        blocked: (prereqOf.get(r.skillId) ?? []).some((id) => !isMet(statusOf.get(id))),
        demandPct: share.get(r.skillId) ?? null,
      }));

    const unmetFoundationIds = foundationIds.filter(
      (id) => !isMet(statusOf.get(id)) && !gaps.some((gap) => gap.skillId === id),
    );
    const foundationSkills = unmetFoundationIds.length
      ? await this.prisma.skill.findMany({ where: { id: { in: unmetFoundationIds } }, select: { id: true, name: true } })
      : [];

    const domains = new Map<string, { key: string; label: string; met: number; total: number }>();
    for (const req of requirements) {
      const key = req.skill.domain?.key ?? 'unassigned';
      const bucket = domains.get(key) ?? { key, label: req.skill.domain?.label ?? 'Unassigned', met: 0, total: 0 };
      bucket.total += 1;
      if (isMet(statusOf.get(req.skillId))) bucket.met += 1;
      domains.set(key, bucket);
    }

    return {
      career: goal.career,
      readiness: score,
      marketContext,
      marketUsedInScore: false,
      marketOrdersGaps: marketEligible,
      gaps: orderGaps(gaps, marketEligible),
      foundations: foundationSkills.map((skill) => ({ skillId: skill.id, name: skill.name })),
      domains: [...domains.values()],
    };
  }
}
