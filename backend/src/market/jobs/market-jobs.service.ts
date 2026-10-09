import { Injectable } from '@nestjs/common';
import { MarketListingStatus, Prisma } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Admin-only views of normalized market jobs. Raw descriptions are never returned in lists. */
@Injectable()
export class MarketJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { companyId?: string; status?: string; q?: string; skip?: number; take?: number }) {
    const where: Prisma.MarketJobWhereInput = {};
    if (params.companyId) where.companyId = params.companyId;
    if (params.status && (Object.values(MarketListingStatus) as string[]).includes(params.status)) {
      where.status = params.status as MarketListingStatus;
    }
    if (params.q) where.normalizedTitle = { contains: params.q.toLowerCase() };
    const take = Math.min(Math.max(params.take ?? 50, 1), 200);
    const skip = Math.max(params.skip ?? 0, 0);
    const [total, items] = await Promise.all([
      this.prisma.marketJob.count({ where }),
      this.prisma.marketJob.findMany({
        where,
        orderBy: { firstSeenAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          title: true,
          normalizedTitle: true,
          seniority: true,
          workType: true,
          locationText: true,
          countries: true,
          isRemote: true,
          experienceMinYears: true,
          experienceMaxYears: true,
          employmentType: true,
          postedAt: true,
          firstSeenAt: true,
          lastSeenAt: true,
          status: true,
          sourceCount: true,
          company: { select: { id: true, name: true } },
        },
      }),
    ]);
    return { total, skip, take, items };
  }

  /** Cross-source merges, for hand-checking that no two different vacancies were merged. */
  merges(take = 50) {
    return this.prisma.marketJob.findMany({
      where: { sourceCount: { gt: 1 } },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(take, 200),
      select: {
        id: true,
        title: true,
        normalizedTitle: true,
        locationText: true,
        company: { select: { name: true } },
        rawJobs: {
          select: {
            id: true,
            rawTitle: true,
            rawLocation: true,
            url: true,
            sourcePostedAt: true,
            source: { select: { type: true, boardToken: true } },
          },
        },
      },
    });
  }

  async detail(id: string) {
    return this.prisma.marketJob.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        rawJobs: {
          select: {
            id: true,
            externalId: true,
            rawTitle: true,
            rawLocation: true,
            url: true,
            listingStatus: true,
            processingStatus: true,
            processingError: true,
            contentPurgedAt: true,
            firstSeenAt: true,
            lastSeenAt: true,
            source: { select: { id: true, type: true, boardToken: true } },
          },
        },
      },
    });
  }
}
