import { Injectable } from '@nestjs/common';
import { MarketDemandBasis, MarketPeriodType } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEMAND_METHODOLOGY_VERSION } from '../market/demand/demand-math';

/**
 * Latest monthly active-stock snapshot versus the previous complete one.
 * The rolling open period is not treated as history.
 */
@Injectable()
export class SnapshotDiffService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string) {
    const goal = await this.prisma.careerGoal.findFirst({
      where: { userId, isActive: true },
      select: { careerId: true, career: { select: { slug: true, title: true } } },
    });
    if (!goal) return { error: 'NO_CAREER_GOAL', note: 'No active career, so there is no market snapshot to compare.' };
    const snaps = await this.prisma.marketCareerSnapshot.findMany({
      where: {
        careerId: goal.careerId,
        laneKey: 'all',
        basis: MarketDemandBasis.ACTIVE_STOCK,
        periodType: MarketPeriodType.MONTH,
        methodologyVersion: DEMAND_METHODOLOGY_VERSION,
      },
      orderBy: { periodStart: 'desc' },
      take: 8,
    });
    const current = snaps[0];
    if (!current) {
      return { career: goal.career, history: 'MISSING', note: 'No monthly active-stock snapshot exists yet. Do not invent percentages.' };
    }
    const previous = snaps.find((snap) => snap.isComplete && snap.periodStart < current.periodStart);
    const currentSkills = await this.skills(goal.careerId, current.periodStart);
    const previousSkills = previous ? await this.skills(goal.careerId, previous.periodStart) : [];
    const prior = new Map(previousSkills.map((row) => [row.skillId, row]));
    const diffs = currentSkills.slice(0, 12).map((row) => {
      const before = prior.get(row.skillId);
      return {
        skill: row.skillName,
        currentShare: row.demandPct,
        previousShare: before?.demandPct ?? null,
        delta: before ? Math.round((row.demandPct - before.demandPct) * 1000) / 1000 : null,
      };
    });
    return {
      career: goal.career,
      basis: 'ACTIVE_STOCK',
      current: { start: current.periodStart, end: current.periodEnd, complete: current.isComplete, n: current.totalJobs, companies: current.companyCount },
      previous: previous
        ? { start: previous.periodStart, end: previous.periodEnd, complete: true, n: previous.totalJobs, companies: previous.companyCount }
        : null,
      history: previous ? 'PRESENT' : 'MISSING',
      note: previous
        ? 'current is the latest monthly ACTIVE_STOCK row. If complete is false, it is the open rolling period and is not the historical snapshot. previous is the last complete month. Do not treat them as the same number.'
        : 'A previous complete month is missing. Say that history is missing. Do not invent a trend.',
      skills: diffs,
    };
  }

  private skills(careerId: string, periodStart: Date) {
    return this.prisma.marketSkillSnapshot.findMany({
      where: {
        careerId,
        periodStart,
        laneKey: 'all',
        basis: MarketDemandBasis.ACTIVE_STOCK,
        periodType: MarketPeriodType.MONTH,
        methodologyVersion: DEMAND_METHODOLOGY_VERSION,
      },
      orderBy: { demandPct: 'desc' },
      take: 12,
      select: { skillId: true, skillName: true, demandPct: true },
    });
  }
}
