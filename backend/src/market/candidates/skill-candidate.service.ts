import { Injectable } from '@nestjs/common';
import { Prisma, SkillCandidateStatus } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Unresolved skill names from postings. M6 exposes them read-only; review actions arrive in M7. */
@Injectable()
export class SkillCandidateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recomputes counts for the given normalized names from MarketJobSkill (idempotent; re-extraction never double counts).
   * Review status is never touched here.
   */
  async refresh(normalizedNames: string[]): Promise<number> {
    const names = [...new Set(normalizedNames.filter(Boolean))];
    if (!names.length) return 0;
    await this.prisma.$executeRaw`
      UPDATE "skill_candidate" c SET "jobCount" = 0, "companyCount" = 0, "updatedAt" = now()
      WHERE c."normalizedName" = ANY(${names}::text[]) AND c."jobCount" > 0
        AND NOT EXISTS (SELECT 1 FROM "market_job_skill" s WHERE s."skillId" IS NULL AND s."normalizedName" = c."normalizedName")`;
    return this.prisma.$executeRaw`
      INSERT INTO "skill_candidate" ("id", "name", "normalizedName", "jobCount", "companyCount", "firstSeenAt", "lastSeenAt", "updatedAt")
      SELECT 'sc_' || md5(s."normalizedName"), MIN(s."rawName"), s."normalizedName",
             COUNT(DISTINCT s."marketJobId")::int, COUNT(DISTINCT j."companyId")::int,
             MIN(j."firstSeenAt"), MAX(j."lastSeenAt"), now()
      FROM "market_job_skill" s
      JOIN "market_job" j ON j.id = s."marketJobId"
      WHERE s."skillId" IS NULL AND s."normalizedName" = ANY(${names}::text[])
      GROUP BY s."normalizedName"
      ON CONFLICT ("normalizedName") DO UPDATE SET
        "jobCount" = EXCLUDED."jobCount",
        "companyCount" = EXCLUDED."companyCount",
        "firstSeenAt" = LEAST("skill_candidate"."firstSeenAt", EXCLUDED."firstSeenAt"),
        "lastSeenAt" = GREATEST("skill_candidate"."lastSeenAt", EXCLUDED."lastSeenAt"),
        "updatedAt" = now()`;
  }

  async list(params: { status?: string; q?: string; skip?: number; take?: number }) {
    const where: Prisma.SkillCandidateWhereInput = {};
    if (params.status && (Object.values(SkillCandidateStatus) as string[]).includes(params.status)) {
      where.status = params.status as SkillCandidateStatus;
    }
    if (params.q) where.normalizedName = { contains: params.q.toLowerCase().replace(/[^a-z0-9]+/g, '') };
    const take = Math.min(Math.max(params.take ?? 50, 1), 200);
    const skip = Math.max(params.skip ?? 0, 0);
    const [total, items, byStatus] = await Promise.all([
      this.prisma.skillCandidate.count({ where }),
      this.prisma.skillCandidate.findMany({
        where,
        orderBy: [{ jobCount: 'desc' }, { normalizedName: 'asc' }],
        skip,
        take,
        include: {
          suggestedSkill: { select: { id: true, name: true } },
          resolvedSkill: { select: { id: true, name: true } },
        },
      }),
      this.prisma.skillCandidate.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      total,
      skip,
      take,
      counts: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      items,
    };
  }
}
