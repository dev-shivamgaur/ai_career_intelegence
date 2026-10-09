import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MarketClassificationStatus, MarketListingStatus, MarketProcessingStatus, Prisma } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IntelConfigService } from '../../intel-config/intel-config.service';
import { SUGGESTED_PATTERNS, normalizePattern } from '../classify/title-classifier';

export const SLICE_BASIS = 'ACTIVE_STOCK' as const;

type SkillRow = {
  key: string;
  skillId: string | null;
  rawName: string;
  jobCount: number;
  requiredCount: number;
  preferredCount: number;
  niceCount: number;
  companyCount: number;
};

/** A skill key is the canonical skill id, or "n:<normalizedName>" for names no Skill resolves yet. */
function parseKey(key: string): Prisma.MarketJobSkillWhereInput {
  if (key.startsWith('n:')) return { skillId: null, normalizedName: key.slice(2) };
  return { skillId: key };
}

/**
 * Admin-only slice report. Counts are raw counts of currently open jobs (ACTIVE_STOCK); no percentages, no trends.
 * Drill-down: career -> skill -> job -> source -> evidence span.
 */
@Injectable()
export class MarketSliceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: IntelConfigService,
  ) {}

  async summary() {
    const open = { status: MarketListingStatus.OPEN };
    const minConf = await this.minClassificationConfidence();
    const [openJobs, byClass, careers, skillTotals, rawCount, linkedJobs, mergedJobs, byProcessing, purged, candidates, fetchRuns] =
      await Promise.all([
        this.prisma.marketJob.count({ where: open }),
        this.prisma.marketJob.groupBy({ by: ['classificationStatus'], where: open, _count: { _all: true } }),
        this.prisma.$queryRaw<Array<{ careerId: string; jobCount: number; companyCount: number }>>`
          SELECT c."careerId", COUNT(DISTINCT j.id)::int AS "jobCount", COUNT(DISTINCT j."companyId")::int AS "companyCount"
          FROM "market_job_career" c JOIN "market_job" j ON j.id = c."marketJobId"
          WHERE j.status = 'OPEN' AND c."laneKey" = 'all' AND c.confidence >= ${minConf}
          GROUP BY c."careerId"`,
        this.prisma.$queryRaw<Array<{ total: number; unresolved: number; unresolvedNames: number }>>`
          SELECT COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE s."skillId" IS NULL)::int AS unresolved,
                 COUNT(DISTINCT s."normalizedName") FILTER (WHERE s."skillId" IS NULL)::int AS "unresolvedNames"
          FROM "market_job_skill" s JOIN "market_job" j ON j.id = s."marketJobId"
          WHERE j.status = 'OPEN'`,
        this.prisma.marketRawJob.count({ where: { marketJobId: { not: null } } }),
        this.prisma.marketJob.count(),
        this.prisma.marketJob.count({ where: { sourceCount: { gt: 1 } } }),
        this.prisma.marketRawJob.groupBy({ by: ['processingStatus'], _count: { _all: true } }),
        this.prisma.marketRawJob.count({ where: { contentPurgedAt: { not: null } } }),
        this.prisma.skillCandidate.count({ where: { status: 'PENDING', jobCount: { gt: 0 } } }),
        this.prisma.marketRun.findMany({
          where: { kind: 'FETCH' },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, trigger: true, status: true, startedAt: true, finishedAt: true, failedTasks: true, totalTasks: true },
        }),
      ]);

    const careerRows = await this.prisma.career.findMany({
      where: { id: { in: careers.map((c) => c.careerId) } },
      select: { id: true, title: true, slug: true },
    });
    const careerById = new Map(careerRows.map((c) => [c.id, c]));
    const classCounts = Object.fromEntries(byClass.map((c) => [c.classificationStatus, c._count._all]));
    const totals = skillTotals[0] ?? { total: 0, unresolved: 0, unresolvedNames: 0 };
    let cleanRuns = 0;
    for (const run of fetchRuns) {
      if (run.status !== 'COMPLETED') break;
      cleanRuns += 1;
    }

    return {
      basis: SLICE_BASIS,
      asOf: new Date().toISOString(),
      openJobs,
      classification: {
        classified: classCounts[MarketClassificationStatus.CLASSIFIED] ?? 0,
        unclassified: classCounts[MarketClassificationStatus.UNCLASSIFIED] ?? 0,
        pending: classCounts[MarketClassificationStatus.PENDING] ?? 0,
      },
      careers: careers
        .map((c) => ({ ...c, title: careerById.get(c.careerId)?.title ?? c.careerId, slug: careerById.get(c.careerId)?.slug ?? null }))
        .sort((a, b) => b.jobCount - a.jobCount),
      quality: {
        skillRows: totals.total,
        unresolvedSkillRows: totals.unresolved,
        unresolvedSkillRate: totals.total ? Math.round((totals.unresolved / totals.total) * 1000) / 1000 : null,
        unresolvedNames: totals.unresolvedNames,
        pendingCandidates: candidates,
        rawJobsLinked: rawCount,
        marketJobs: linkedJobs,
        mergedJobs,
        mergeRate: rawCount ? Math.round((1 - linkedJobs / rawCount) * 1000) / 1000 : null,
        unclassifiedRate: openJobs ? Math.round(((classCounts.UNCLASSIFIED ?? 0) / openJobs) * 1000) / 1000 : null,
        processing: Object.fromEntries(byProcessing.map((p) => [p.processingStatus, p._count._all])),
        failedRows: byProcessing.find((p) => p.processingStatus === MarketProcessingStatus.FAILED)?._count._all ?? 0,
        purgedDescriptions: purged,
      },
      fetchRuns,
      consecutiveCleanFetchRuns: cleanRuns,
    };
  }

  private async minClassificationConfidence() {
    return (await this.config.get('demand')).minClassificationConfidence;
  }

  /**
   * Top skills of one career (or one of its lanes) over its open jobs, strongest level per job counted once.
   * Only career assignments at or above demand.minClassificationConfidence count.
   */
  async careerSkills(careerId: string, take = 50, lane = 'all') {
    const career = await this.prisma.career.findUnique({ where: { id: careerId }, select: { id: true, title: true, slug: true } });
    if (!career) throw new NotFoundException({ error: 'CAREER_NOT_FOUND', message: 'Career not found' });
    const { minSkillConfidence, minClassificationConfidence: minConf } = await this.config.get('demand');
    const limit = Math.min(Math.max(take, 1), 200);
    const laneKey = lane || 'all';
    const [jobs, rows, lanes] = await Promise.all([
      this.prisma.$queryRaw<Array<{ jobCount: number; companyCount: number }>>`
        SELECT COUNT(DISTINCT j.id)::int AS "jobCount", COUNT(DISTINCT j."companyId")::int AS "companyCount"
        FROM "market_job_career" c JOIN "market_job" j ON j.id = c."marketJobId"
        WHERE c."careerId" = ${careerId} AND c."laneKey" = ${laneKey} AND c.confidence >= ${minConf} AND j.status = 'OPEN'`,
      this.prisma.$queryRaw<SkillRow[]>`
        WITH jobs AS (
          SELECT DISTINCT j.id, j."companyId"
          FROM "market_job_career" c JOIN "market_job" j ON j.id = c."marketJobId"
          WHERE c."careerId" = ${careerId} AND c."laneKey" = ${laneKey} AND c.confidence >= ${minConf} AND j.status = 'OPEN'
        ),
        per_job AS (
          SELECT s."marketJobId", jobs."companyId",
                 COALESCE(s."skillId", 'n:' || s."normalizedName") AS key,
                 MAX(s."skillId") AS "skillId", MIN(s."rawName") AS "rawName",
                 MAX(CASE s.level WHEN 'REQUIRED' THEN 3 WHEN 'RECOMMENDED' THEN 2 ELSE 1 END) AS lvl
          FROM "market_job_skill" s JOIN jobs ON jobs.id = s."marketJobId"
          WHERE s.confidence >= ${minSkillConfidence}
          GROUP BY s."marketJobId", jobs."companyId", COALESCE(s."skillId", 'n:' || s."normalizedName")
        )
        SELECT key, MAX("skillId") AS "skillId", MIN("rawName") AS "rawName",
               COUNT(*)::int AS "jobCount",
               COUNT(*) FILTER (WHERE lvl = 3)::int AS "requiredCount",
               COUNT(*) FILTER (WHERE lvl = 2)::int AS "preferredCount",
               COUNT(*) FILTER (WHERE lvl = 1)::int AS "niceCount",
               COUNT(DISTINCT "companyId")::int AS "companyCount"
        FROM per_job
        GROUP BY key
        ORDER BY "jobCount" DESC, key
        LIMIT ${limit}`,
      this.prisma.$queryRaw<Array<{ laneKey: string; jobCount: number }>>`
        SELECT c."laneKey", COUNT(DISTINCT j.id)::int AS "jobCount"
        FROM "market_job_career" c JOIN "market_job" j ON j.id = c."marketJobId"
        WHERE c."careerId" = ${careerId} AND c."laneKey" <> 'all' AND c.confidence >= ${minConf} AND j.status = 'OPEN'
        GROUP BY c."laneKey" ORDER BY "jobCount" DESC, c."laneKey"`,
    ]);
    const skillIds = rows.map((r) => r.skillId).filter((id): id is string => !!id);
    const skills = await this.prisma.skill.findMany({ where: { id: { in: skillIds } }, select: { id: true, name: true } });
    const nameById = new Map(skills.map((s) => [s.id, s.name]));
    return {
      basis: SLICE_BASIS,
      career,
      lane: laneKey,
      lanes,
      minClassificationConfidence: minConf,
      jobCount: jobs[0]?.jobCount ?? 0,
      companyCount: jobs[0]?.companyCount ?? 0,
      skills: rows.map((r) => ({
        key: r.key,
        skillId: r.skillId,
        name: r.skillId ? (nameById.get(r.skillId) ?? r.rawName) : r.rawName,
        resolved: !!r.skillId,
        jobCount: r.jobCount,
        requiredCount: r.requiredCount,
        preferredCount: r.preferredCount,
        niceCount: r.niceCount,
        companyCount: r.companyCount,
      })),
    };
  }

  /** Open jobs of a career that ask for one skill, each with its source postings and evidence excerpts. */
  async skillJobs(careerId: string, key: string, take = 50, lane = 'all') {
    if (!key) throw new BadRequestException({ error: 'SKILL_KEY_REQUIRED', message: 'Skill key is required' });
    const skillWhere = parseKey(key);
    const minConf = await this.minClassificationConfidence();
    const jobs = await this.prisma.marketJob.findMany({
      where: {
        status: MarketListingStatus.OPEN,
        careers: { some: { careerId, laneKey: lane || 'all', confidence: { gte: minConf } } },
        skills: { some: skillWhere },
      },
      orderBy: { firstSeenAt: 'desc' },
      take: Math.min(Math.max(take, 1), 200),
      select: {
        id: true,
        title: true,
        locationText: true,
        seniority: true,
        firstSeenAt: true,
        sourceCount: true,
        company: { select: { id: true, name: true } },
        careers: { where: { careerId }, select: { laneKey: true, method: true, matchedPattern: true, confidence: true } },
        skills: {
          where: skillWhere,
          select: {
            rawName: true,
            level: true,
            confidence: true,
            method: true,
            evidence: true,
            evidenceStart: true,
            evidenceEnd: true,
            yearsRequired: true,
            extractorVersion: true,
            rawJob: {
              select: {
                id: true,
                externalId: true,
                url: true,
                contentPurgedAt: true,
                source: { select: { id: true, type: true, boardToken: true } },
              },
            },
          },
        },
      },
    });
    return { basis: SLICE_BASIS, careerId, key, lane: lane || 'all', jobs };
  }

  /** Careers with their market title patterns, the built-in suggestions and how many open jobs each currently has. */
  async careerProfiles() {
    const minConf = await this.minClassificationConfidence();
    const [careers, counts, unclassified] = await Promise.all([
      this.prisma.career.findMany({
        where: { isCustom: false },
        orderBy: { title: 'asc' },
        select: { id: true, title: true, slug: true, marketProfile: true },
      }),
      this.prisma.$queryRaw<Array<{ careerId: string; jobCount: number }>>`
        SELECT c."careerId", COUNT(DISTINCT j.id)::int AS "jobCount"
        FROM "market_job_career" c JOIN "market_job" j ON j.id = c."marketJobId"
        WHERE j.status = 'OPEN' AND c."laneKey" = 'all' AND c.confidence >= ${minConf} GROUP BY c."careerId"`,
      this.prisma.marketJob.findMany({
        where: { status: MarketListingStatus.OPEN, classificationStatus: MarketClassificationStatus.UNCLASSIFIED },
        orderBy: { firstSeenAt: 'desc' },
        take: 50,
        select: { id: true, title: true, normalizedTitle: true, company: { select: { name: true } } },
      }),
    ]);
    const byCareer = new Map(counts.map((c) => [c.careerId, c.jobCount]));
    return {
      careers: careers.map((c) => ({
        id: c.id,
        title: c.title,
        slug: c.slug,
        profile: c.marketProfile,
        suggested: SUGGESTED_PATTERNS[c.slug] ?? null,
        openJobs: byCareer.get(c.id) ?? 0,
      })),
      unclassifiedSample: unclassified,
    };
  }

  async saveProfile(careerId: string, dto: { titlePatterns: string[]; excludePatterns: string[]; enabled?: boolean }, actorId: string) {
    const career = await this.prisma.career.findUnique({ where: { id: careerId }, select: { id: true } });
    if (!career) throw new NotFoundException({ error: 'CAREER_NOT_FOUND', message: 'Career not found' });
    const clean = (list: string[]) => [...new Set(list.map((p) => p.trim()).filter(Boolean))];
    const titlePatterns = clean(dto.titlePatterns);
    const empty = titlePatterns.filter((p) => !normalizePattern(p));
    if (empty.length) {
      throw new BadRequestException({
        error: 'PATTERN_EMPTY_AFTER_NORMALIZATION',
        message: `These patterns contain only seniority or location words: ${empty.join(', ')}`,
      });
    }
    const data = { titlePatterns, excludePatterns: clean(dto.excludePatterns), enabled: dto.enabled ?? true, updatedBy: actorId };
    return this.prisma.marketCareerProfile.upsert({ where: { careerId }, create: { careerId, ...data }, update: data });
  }
}
