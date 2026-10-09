import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, SkillCandidateStatus } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeSkillName } from '../../skill-intel/skill-normalize';
import { SkillResolverService } from '../../skill-intel/skill-resolver.service';

type Tx = Prisma.TransactionClient;

export type MergePlan = {
  source: { id: string; name: string };
  target: { id: string; name: string };
  moves: Record<string, number>;
  conflicts: Record<string, number>;
  aliasAdded: boolean;
};

/**
 * Admin review of unresolved skill names. Market ingestion never creates Skill rows; only "approve as new skill"
 * here does, and only when nothing already resolves the name. Every decision is written to SkillReviewLog.
 */
@Injectable()
export class SkillReviewService {
  private readonly logger = new Logger(SkillReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: SkillResolverService,
  ) {}

  /** Points unresolved MarketJobSkill rows with this name at the skill. A raw job that already has the skill keeps one row. */
  async relink(tx: Tx, normalizedName: string, skillId: string, method: string): Promise<{ relinked: number; collapsed: number }> {
    const collapsed = await tx.$executeRaw`
      DELETE FROM "market_job_skill" s
      WHERE s."skillId" IS NULL AND s."normalizedName" = ${normalizedName}
        AND EXISTS (SELECT 1 FROM "market_job_skill" o WHERE o."rawJobId" = s."rawJobId" AND o."skillId" = ${skillId})`;
    const relinked = await tx.$executeRaw`
      UPDATE "market_job_skill" SET "skillId" = ${skillId}, "resolveMethod" = ${method}
      WHERE "skillId" IS NULL AND "normalizedName" = ${normalizedName}`;
    return { relinked, collapsed };
  }

  private async candidate(id: string) {
    const c = await this.prisma.skillCandidate.findUnique({ where: { id } });
    if (!c) throw new NotFoundException({ error: 'CANDIDATE_NOT_FOUND', message: 'Skill candidate not found' });
    return c;
  }

  private assertOpen(status: SkillCandidateStatus) {
    if (status !== SkillCandidateStatus.PENDING) {
      throw new ConflictException({ error: 'CANDIDATE_ALREADY_REVIEWED', message: `Candidate is already ${status}` });
    }
  }

  /** Creates an approved alias; refuses when the normalized form already belongs to another skill or skill name. */
  private async ensureAlias(tx: Tx, skillId: string, alias: string, source: string): Promise<boolean> {
    const normalizedAlias = normalizeSkillName(alias);
    if (!normalizedAlias) throw new BadRequestException({ error: 'ALIAS_EMPTY', message: 'Alias is empty after normalization' });
    const existing = await tx.skillAlias.findUnique({ where: { normalizedAlias } });
    if (existing) {
      if (existing.skillId !== skillId) {
        throw new ConflictException({ error: 'ALIAS_TAKEN', message: `"${alias}" is already an alias of another skill` });
      }
      if (existing.status !== 'APPROVED') await tx.skillAlias.update({ where: { id: existing.id }, data: { status: 'APPROVED' } });
      return false;
    }
    const owner = await tx.skill.findFirst({ where: { normalizedName: normalizedAlias, id: { not: skillId } }, select: { name: true } });
    if (owner) throw new ConflictException({ error: 'ALIAS_IS_SKILL', message: `"${alias}" is the name of skill ${owner.name}` });
    await tx.skillAlias.create({ data: { skillId, alias, normalizedAlias, status: 'APPROVED', source } });
    return true;
  }

  async mapToSkill(candidateId: string, skillId: string, actorId: string | null, auto = false) {
    const c = await this.candidate(candidateId);
    this.assertOpen(c.status);
    const skill = await this.prisma.skill.findUnique({ where: { id: skillId }, select: { id: true, name: true } });
    if (!skill) throw new NotFoundException({ error: 'SKILL_NOT_FOUND', message: 'Skill not found' });
    const result = await this.prisma.$transaction(async (tx) => {
      const aliasAdded = normalizeSkillName(skill.name) === c.normalizedName ? false : await this.ensureAlias(tx, skill.id, c.name, auto ? 'AUTO' : 'ADMIN');
      const links = await this.relink(tx, c.normalizedName, skill.id, 'ALIAS');
      await tx.skillCandidate.update({
        where: { id: c.id },
        data: { status: 'MAPPED', resolvedSkillId: skill.id, autoApproved: auto, reviewedBy: actorId ?? 'auto', reviewedAt: new Date() },
      });
      await tx.skillReviewLog.create({
        data: { action: auto ? 'AUTO_MAP' : 'MAP_ALIAS', candidateId: c.id, skillId: skill.id, actorId, details: { alias: c.name, aliasAdded, ...links } },
      });
      return { aliasAdded, ...links };
    });
    this.resolver.invalidate();
    return { candidateId: c.id, status: 'MAPPED' as const, skill, ...result };
  }

  async approveAsNew(candidateId: string, dto: { name?: string; category?: string; domainId?: string }, actorId: string) {
    const c = await this.candidate(candidateId);
    this.assertOpen(c.status);
    const name = (dto.name ?? c.name).replace(/\s+/g, ' ').trim();
    if (!name) throw new BadRequestException({ error: 'SKILL_NAME_REQUIRED', message: 'Skill name is required' });
    const existing = await this.resolver.resolve(name);
    if (existing.skillId) {
      throw new ConflictException({
        error: 'SKILL_EXISTS',
        message: `"${name}" already resolves to ${existing.skillName}; map the candidate to it instead`,
        skillId: existing.skillId,
      });
    }
    let category = dto.category?.trim() || 'Market';
    if (dto.domainId) {
      const domain = await this.prisma.skillDomain.findUnique({ where: { id: dto.domainId } });
      if (!domain) throw new BadRequestException({ error: 'DOMAIN_NOT_FOUND', message: 'Skill domain not found' });
      if (!dto.category) category = domain.label;
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const skill = await tx.skill.create({
        data: { name, category, normalizedName: normalizeSkillName(name), domainId: dto.domainId ?? null },
        select: { id: true, name: true },
      });
      const aliasAdded = normalizeSkillName(name) === c.normalizedName ? false : await this.ensureAlias(tx, skill.id, c.name, 'ADMIN');
      const links = await this.relink(tx, c.normalizedName, skill.id, 'REVIEW');
      await tx.skillCandidate.update({
        where: { id: c.id },
        data: { status: 'APPROVED', resolvedSkillId: skill.id, reviewedBy: actorId, reviewedAt: new Date() },
      });
      await tx.skillReviewLog.create({
        data: { action: 'APPROVE_NEW', candidateId: c.id, skillId: skill.id, actorId, details: { name, category, aliasAdded, ...links } },
      });
      return { skill, aliasAdded, ...links };
    });
    this.resolver.invalidate();
    return { candidateId: c.id, status: 'APPROVED' as const, ...result };
  }

  /** Not a skill. Its rows are removed from MarketJobSkill and future extraction drops the name. */
  async reject(candidateId: string, note: string | undefined, actorId: string) {
    const c = await this.candidate(candidateId);
    this.assertOpen(c.status);
    const removed = await this.prisma.$transaction(async (tx) => {
      const del = await tx.marketJobSkill.deleteMany({ where: { skillId: null, normalizedName: c.normalizedName } });
      await tx.skillCandidate.update({
        where: { id: c.id },
        data: { status: 'REJECTED', note: note ?? null, jobCount: 0, companyCount: 0, reviewedBy: actorId, reviewedAt: new Date() },
      });
      await tx.skillReviewLog.create({ data: { action: 'REJECT', candidateId: c.id, actorId, details: { note: note ?? null, rowsRemoved: del.count } } });
      return del.count;
    });
    return { candidateId: c.id, status: 'REJECTED' as const, rowsRemoved: removed };
  }

  /** Back to PENDING. Rows removed by a rejection come back when the affected sources are reprocessed. */
  async reopen(candidateId: string, actorId: string) {
    const c = await this.candidate(candidateId);
    if (c.status !== 'REJECTED') throw new ConflictException({ error: 'CANDIDATE_NOT_REJECTED', message: 'Only rejected candidates can be reopened' });
    await this.prisma.$transaction([
      this.prisma.skillCandidate.update({ where: { id: c.id }, data: { status: 'PENDING', reviewedBy: null, reviewedAt: null } }),
      this.prisma.skillReviewLog.create({ data: { action: 'REOPEN', candidateId: c.id, actorId } }),
    ]);
    return { candidateId: c.id, status: 'PENDING' as const };
  }

  listAliases(params: { q?: string; skillId?: string; take?: number }) {
    const where: Prisma.SkillAliasWhereInput = {};
    if (params.skillId) where.skillId = params.skillId;
    if (params.q) where.normalizedAlias = { contains: normalizeSkillName(params.q) };
    return this.prisma.skillAlias.findMany({
      where,
      orderBy: { normalizedAlias: 'asc' },
      take: Math.min(Math.max(params.take ?? 100, 1), 500),
      include: { skill: { select: { id: true, name: true } } },
    });
  }

  async addAlias(skillId: string, alias: string, actorId: string) {
    const skill = await this.prisma.skill.findUnique({ where: { id: skillId }, select: { id: true, name: true } });
    if (!skill) throw new NotFoundException({ error: 'SKILL_NOT_FOUND', message: 'Skill not found' });
    const normalized = normalizeSkillName(alias);
    const result = await this.prisma.$transaction(async (tx) => {
      const aliasAdded = await this.ensureAlias(tx, skill.id, alias.trim(), 'ADMIN');
      const links = await this.relink(tx, normalized, skill.id, 'ALIAS');
      const pending = await tx.skillCandidate.updateMany({
        where: { normalizedName: normalized, status: 'PENDING' },
        data: { status: 'MAPPED', resolvedSkillId: skill.id, reviewedBy: actorId, reviewedAt: new Date() },
      });
      await tx.skillReviewLog.create({
        data: { action: 'ADD_ALIAS', skillId: skill.id, actorId, details: { alias, aliasAdded, candidatesMapped: pending.count, ...links } },
      });
      return { aliasAdded, candidatesMapped: pending.count, ...links };
    });
    this.resolver.invalidate();
    return { skill, ...result };
  }

  /** Stops an alias from resolving. Rows already linked stay linked; re-extraction will leave the name unresolved. */
  async disableAlias(aliasId: string, actorId: string) {
    const alias = await this.prisma.skillAlias.findUnique({ where: { id: aliasId } });
    if (!alias) throw new NotFoundException({ error: 'ALIAS_NOT_FOUND', message: 'Alias not found' });
    await this.prisma.$transaction([
      this.prisma.skillAlias.update({ where: { id: aliasId }, data: { status: 'REJECTED' } }),
      this.prisma.skillReviewLog.create({ data: { action: 'DISABLE_ALIAS', skillId: alias.skillId, actorId, details: { alias: alias.alias } } }),
    ]);
    this.resolver.invalidate();
    return { id: aliasId, status: 'REJECTED' as const };
  }

  /** Skill rows whose names normalize to the same key, oldest first (the natural merge target). */
  async duplicates() {
    const skills = await this.prisma.skill.findMany({ select: { id: true, name: true, category: true, createdAt: true }, orderBy: { createdAt: 'asc' } });
    const groups = new Map<string, typeof skills>();
    for (const s of skills) {
      const key = normalizeSkillName(s.name);
      if (key) groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    return [...groups.entries()].filter(([, g]) => g.length > 1).map(([key, g]) => ({ key, skills: g }));
  }

  log(take = 100) {
    return this.prisma.skillReviewLog.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(take, 1), 500) });
  }

  /**
   * Merges a duplicate Skill into another. Dry run by default: returns what would move and which rows would be
   * dropped because the target already has an equivalent row. Executing runs in one transaction and is logged.
   */
  async mergeSkills(sourceId: string, targetId: string, execute: boolean, actorId: string): Promise<MergePlan & { executed: boolean }> {
    if (sourceId === targetId) throw new BadRequestException({ error: 'MERGE_SAME_SKILL', message: 'Source and target must differ' });
    const [source, target] = await Promise.all([
      this.prisma.skill.findUnique({ where: { id: sourceId }, select: { id: true, name: true } }),
      this.prisma.skill.findUnique({ where: { id: targetId }, select: { id: true, name: true } }),
    ]);
    if (!source || !target) throw new NotFoundException({ error: 'SKILL_NOT_FOUND', message: 'Source or target skill not found' });

    const run = async (tx: Tx, apply: boolean): Promise<MergePlan> => {
      const conflicts: Record<string, number> = {
        userSkill: await tx.$queryRaw<Array<{ n: number }>>`
          SELECT COUNT(*)::int AS n FROM "user_skill" s WHERE s."skillId" = ${sourceId}
            AND EXISTS (SELECT 1 FROM "user_skill" t WHERE t."skillId" = ${targetId} AND t."profileId" = s."profileId")`.then((r) => r[0].n),
        careerSkillRequirement: await tx.$queryRaw<Array<{ n: number }>>`
          SELECT COUNT(*)::int AS n FROM "career_skill_requirement" s WHERE s."skillId" = ${sourceId}
            AND EXISTS (SELECT 1 FROM "career_skill_requirement" t WHERE t."skillId" = ${targetId} AND t."careerId" = s."careerId"
                        AND t."stackLane" IS NOT DISTINCT FROM s."stackLane")`.then((r) => r[0].n),
        skillGap: await tx.$queryRaw<Array<{ n: number }>>`
          SELECT COUNT(*)::int AS n FROM "skill_gap" s WHERE s."skillId" = ${sourceId}
            AND EXISTS (SELECT 1 FROM "skill_gap" t WHERE t."skillId" = ${targetId} AND t."userId" = s."userId")`.then((r) => r[0].n),
        jobSkill: await tx.$queryRaw<Array<{ n: number }>>`
          SELECT COUNT(*)::int AS n FROM "job_skill" s WHERE s."skillId" = ${sourceId}
            AND EXISTS (SELECT 1 FROM "job_skill" t WHERE t."skillId" = ${targetId} AND t."jobId" = s."jobId")`.then((r) => r[0].n),
      };
      const moves: Record<string, number> = {
        userSkill: (await tx.userSkill.count({ where: { skillId: sourceId } })) - conflicts.userSkill,
        careerSkillRequirement: (await tx.careerSkillRequirement.count({ where: { skillId: sourceId } })) - conflicts.careerSkillRequirement,
        skillGap: (await tx.skillGap.count({ where: { skillId: sourceId } })) - conflicts.skillGap,
        jobSkill: (await tx.jobSkill.count({ where: { skillId: sourceId } })) - conflicts.jobSkill,
        marketJobSkill: await tx.marketJobSkill.count({ where: { skillId: sourceId } }),
        skillAlias: await tx.skillAlias.count({ where: { skillId: sourceId } }),
        skillCandidate: await tx.skillCandidate.count({ where: { OR: [{ suggestedSkillId: sourceId }, { resolvedSkillId: sourceId }] } }),
      };
      const sourceKey = normalizeSkillName(source.name);
      const aliasTaken = await tx.skillAlias.findUnique({ where: { normalizedAlias: sourceKey } });
      const aliasAdded = !!sourceKey && sourceKey !== normalizeSkillName(target.name) && (!aliasTaken || aliasTaken.skillId === sourceId);
      if (!apply) return { source, target, moves, conflicts, aliasAdded };

      await tx.$executeRaw`DELETE FROM "user_skill" s WHERE s."skillId" = ${sourceId}
        AND EXISTS (SELECT 1 FROM "user_skill" t WHERE t."skillId" = ${targetId} AND t."profileId" = s."profileId")`;
      await tx.$executeRaw`DELETE FROM "career_skill_requirement" s WHERE s."skillId" = ${sourceId}
        AND EXISTS (SELECT 1 FROM "career_skill_requirement" t WHERE t."skillId" = ${targetId} AND t."careerId" = s."careerId"
                    AND t."stackLane" IS NOT DISTINCT FROM s."stackLane")`;
      await tx.$executeRaw`DELETE FROM "skill_gap" s WHERE s."skillId" = ${sourceId}
        AND EXISTS (SELECT 1 FROM "skill_gap" t WHERE t."skillId" = ${targetId} AND t."userId" = s."userId")`;
      await tx.$executeRaw`DELETE FROM "job_skill" s WHERE s."skillId" = ${sourceId}
        AND EXISTS (SELECT 1 FROM "job_skill" t WHERE t."skillId" = ${targetId} AND t."jobId" = s."jobId")`;
      await tx.userSkill.updateMany({ where: { skillId: sourceId }, data: { skillId: targetId } });
      await tx.careerSkillRequirement.updateMany({ where: { skillId: sourceId }, data: { skillId: targetId } });
      await tx.skillGap.updateMany({ where: { skillId: sourceId }, data: { skillId: targetId } });
      await tx.jobSkill.updateMany({ where: { skillId: sourceId }, data: { skillId: targetId } });
      await tx.marketJobSkill.updateMany({ where: { skillId: sourceId }, data: { skillId: targetId } });
      await tx.skillAlias.updateMany({ where: { skillId: sourceId }, data: { skillId: targetId } });
      await tx.skillCandidate.updateMany({ where: { suggestedSkillId: sourceId }, data: { suggestedSkillId: targetId } });
      await tx.skillCandidate.updateMany({ where: { resolvedSkillId: sourceId }, data: { resolvedSkillId: targetId } });
      await tx.skill.delete({ where: { id: sourceId } });
      if (aliasAdded && !aliasTaken) {
        await tx.skillAlias.create({ data: { skillId: targetId, alias: source.name, normalizedAlias: sourceKey, status: 'APPROVED', source: 'MERGE' } });
      }
      await tx.skillReviewLog.create({
        data: { action: 'MERGE_SKILL', skillId: sourceId, targetSkillId: targetId, actorId, details: { source: source.name, target: target.name, moves, conflicts, aliasAdded } },
      });
      return { source, target, moves, conflicts, aliasAdded };
    };

    if (!execute) return { ...(await run(this.prisma as unknown as Tx, false)), executed: false };
    const plan = await this.prisma.$transaction((tx) => run(tx, true), { timeout: 60_000 });
    this.resolver.invalidate();
    this.logger.log(`Merged skill ${source.name} into ${target.name}: ${JSON.stringify(plan.moves)}`);
    return { ...plan, executed: true };
  }
}
