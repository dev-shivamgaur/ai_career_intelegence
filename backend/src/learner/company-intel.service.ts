import { Injectable } from '@nestjs/common';
import { MarketDemandBasis, MarketPeriodType } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEMAND_METHODOLOGY_VERSION } from '../market/demand/demand-math';

const DISCLAIMER = 'Observed public job postings in the monitored panel. This is not the company hiring strategy, actual hires, or future plans.';

type CompanyCountRow = {
  companyId: string;
  name: string;
  jobs: number;
  careers: number;
  skills: number;
};

@Injectable()
export class CompanyIntelService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const periods = await this.prisma.marketCareerSnapshot.findMany({
      where: {
        periodType: MarketPeriodType.MONTH,
        basis: MarketDemandBasis.ACTIVE_STOCK,
        isComplete: true,
        laneKey: 'all',
        methodologyVersion: DEMAND_METHODOLOGY_VERSION,
      },
      distinct: ['periodStart'],
      orderBy: { periodStart: 'desc' },
      take: 2,
      select: { periodStart: true, periodEnd: true },
    });
    const current = periods[0];
    const previous = periods[1];
    if (!current) return { disclaimer: DISCLAIMER, periods: null, companies: [] };
    const nowRows = await this.counts(current.periodStart, current.periodEnd);
    const thenRows = previous ? await this.counts(previous.periodStart, previous.periodEnd) : [];
    const prior = new Map(thenRows.map((row) => [row.companyId, row] as const));
    return {
      disclaimer: DISCLAIMER,
      periods: {
        current: { start: current.periodStart, end: current.periodEnd },
        previous: previous ? { start: previous.periodStart, end: previous.periodEnd } : null,
      },
      companies: nowRows.map((row) => {
        const before = prior.get(row.companyId);
        return {
          ...row,
          previousJobs: before?.jobs ?? null,
          jobDelta: before ? row.jobs - before.jobs : null,
        };
      }),
    };
  }

  private counts(start: Date, end: Date): Promise<CompanyCountRow[]> {
    return this.prisma.$queryRaw<CompanyCountRow[]>`
      SELECT c.id AS "companyId", c.name,
             COUNT(DISTINCT j.id)::int AS jobs,
             COUNT(DISTINCT jc."careerId")::int AS careers,
             COUNT(DISTINCT s."skillId")::int AS skills
      FROM "market_job" j
      JOIN "company" c ON c.id = j."companyId"
      LEFT JOIN "market_job_career" jc ON jc."marketJobId" = j.id AND jc."laneKey" = 'all'
      LEFT JOIN "market_job_skill" s ON s."marketJobId" = j.id AND s."skillId" IS NOT NULL
      WHERE j."firstSeenAt" < ${end} AND COALESCE(j."closedAt", j."lastSeenAt") >= ${start}
      GROUP BY c.id, c.name
      ORDER BY jobs DESC, c.name ASC
      LIMIT 50`;
  }
}
