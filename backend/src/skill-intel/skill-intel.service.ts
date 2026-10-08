import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SkillAliasStatus } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { findDuplicateGroups } from './skill-duplicates';
import { normalizeSkillName } from './skill-normalize';
import { SkillResolverService } from './skill-resolver.service';
import type { CreateSkillAliasDto, CreateSkillDomainDto, UpdateSkillDomainDto } from './dto/skill-intel.dto';

/** Admin operations for domains, aliases and reports. Never edits CareerSkillRequirement or UserSkill. */
@Injectable()
export class SkillIntelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: SkillResolverService,
  ) {}

  listDomains() {
    return this.prisma.skillDomain.findMany({
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      include: { _count: { select: { skills: true } } },
    });
  }

  async createDomain(dto: CreateSkillDomainDto) {
    const exists = await this.prisma.skillDomain.findUnique({ where: { key: dto.key } });
    if (exists) throw new ConflictException({ error: 'DOMAIN_EXISTS', message: `Domain ${dto.key} already exists` });
    let parentId: string | null = null;
    if (dto.parentKey) {
      const parent = await this.prisma.skillDomain.findUnique({ where: { key: dto.parentKey } });
      if (!parent) throw new BadRequestException({ error: 'PARENT_NOT_FOUND', message: `No domain ${dto.parentKey}` });
      if (parent.parentId) throw new BadRequestException({ error: 'DOMAIN_DEPTH', message: 'Domains allow one level of nesting' });
      parentId = parent.id;
    }
    return this.prisma.skillDomain.create({
      data: { key: dto.key, label: dto.label, parentId, sortOrder: dto.sortOrder ?? 0 },
    });
  }

  async updateDomain(key: string, dto: UpdateSkillDomainDto) {
    const row = await this.prisma.skillDomain.findUnique({ where: { key } });
    if (!row) throw new NotFoundException({ error: 'DOMAIN_NOT_FOUND', message: `No domain ${key}` });
    return this.prisma.skillDomain.update({ where: { key }, data: dto });
  }

  async setSkillDomain(skillId: string, domainKey: string | null | undefined) {
    const skill = await this.prisma.skill.findUnique({ where: { id: skillId } });
    if (!skill) throw new NotFoundException({ error: 'SKILL_NOT_FOUND', message: 'Skill not found' });
    let domainId: string | null = null;
    if (domainKey) {
      const domain = await this.prisma.skillDomain.findUnique({ where: { key: domainKey } });
      if (!domain || !domain.active) {
        throw new BadRequestException({ error: 'DOMAIN_NOT_FOUND', message: `No active domain ${domainKey}` });
      }
      domainId = domain.id;
    }
    await this.prisma.$executeRaw`UPDATE skill SET "domainId" = ${domainId} WHERE id = ${skillId}`;
    return { skillId, domainKey: domainKey ?? null };
  }

  listAliases(skillId?: string, status?: SkillAliasStatus) {
    return this.prisma.skillAlias.findMany({
      where: { ...(skillId ? { skillId } : {}), ...(status ? { status } : {}) },
      include: { skill: { select: { id: true, name: true } } },
      orderBy: { alias: 'asc' },
      take: 500,
    });
  }

  async createAlias(dto: CreateSkillAliasDto) {
    const skill = await this.prisma.skill.findUnique({ where: { id: dto.skillId } });
    if (!skill) throw new NotFoundException({ error: 'SKILL_NOT_FOUND', message: 'Skill not found' });
    const normalizedAlias = normalizeSkillName(dto.alias);
    if (!normalizedAlias) throw new BadRequestException({ error: 'INVALID_ALIAS', message: 'Alias is empty after normalization' });
    if (normalizedAlias === normalizeSkillName(skill.name)) {
      throw new BadRequestException({ error: 'ALIAS_IS_NAME', message: 'Alias equals the skill name after normalization' });
    }
    const clash = await this.prisma.skillAlias.findUnique({ where: { normalizedAlias }, include: { skill: true } });
    if (clash) {
      throw new ConflictException({ error: 'ALIAS_EXISTS', message: `Alias already maps to ${clash.skill.name}` });
    }
    const row = await this.prisma.skillAlias.create({
      data: { skillId: skill.id, alias: dto.alias.trim(), normalizedAlias, status: SkillAliasStatus.APPROVED, source: 'ADMIN' },
    });
    this.resolver.invalidate();
    return row;
  }

  async updateAlias(id: string, status: SkillAliasStatus) {
    const row = await this.prisma.skillAlias.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ error: 'ALIAS_NOT_FOUND', message: 'Alias not found' });
    const saved = await this.prisma.skillAlias.update({ where: { id }, data: { status } });
    this.resolver.invalidate();
    return saved;
  }

  async deleteAlias(id: string) {
    const row = await this.prisma.skillAlias.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ error: 'ALIAS_NOT_FOUND', message: 'Alias not found' });
    await this.prisma.skillAlias.delete({ where: { id } });
    this.resolver.invalidate();
    return { deleted: true };
  }

  async duplicateReport() {
    const skills = await this.prisma.skill.findMany({
      select: {
        id: true,
        name: true,
        category: true,
        _count: { select: { userSkills: true, careerRequirements: true, jobSkills: true, skillGaps: true } },
      },
    });
    const groups = findDuplicateGroups(
      skills.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        references: s._count.userSkills + s._count.careerRequirements + s._count.jobSkills + s._count.skillGaps,
      })),
    );
    return { totalSkills: skills.length, duplicateGroups: groups.length, groups };
  }

  async provenanceSummary() {
    const rows = await this.prisma.careerSkillRequirement.groupBy({ by: ['source'], _count: { _all: true } });
    return rows.map((r) => ({ source: r.source, count: r._count._all }));
  }
}
