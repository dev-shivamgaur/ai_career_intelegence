import { Injectable, NotFoundException } from '@nestjs/common';
import { LearningResourceKind } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LearningResourceService {
  constructor(private readonly prisma: PrismaService) {}

  list(skillId?: string) {
    return this.prisma.learningResource.findMany({
      where: { active: true, ...(skillId ? { skillId } : {}) },
      orderBy: { title: 'asc' },
      include: { skill: { select: { id: true, name: true } } },
    });
  }

  async create(input: { skillId: string; title: string; url: string; kind: LearningResourceKind }) {
    const skill = await this.prisma.skill.findUnique({ where: { id: input.skillId }, select: { id: true } });
    if (!skill) throw new NotFoundException({ error: 'SKILL_NOT_FOUND', message: 'Skill not found' });
    return this.prisma.learningResource.create({ data: input });
  }

  async disable(id: string) {
    const row = await this.prisma.learningResource.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ error: 'RESOURCE_NOT_FOUND', message: 'Resource not found' });
    return this.prisma.learningResource.update({ where: { id }, data: { active: false } });
  }

  async forSkills(skillIds: string[]) {
    if (!skillIds.length) return new Map<string, Array<{ title: string; url: string; kind: LearningResourceKind }>>();
    const rows = await this.prisma.learningResource.findMany({
      where: { skillId: { in: skillIds }, active: true },
      select: { skillId: true, title: true, url: true, kind: true },
    });
    const out = new Map<string, Array<{ title: string; url: string; kind: LearningResourceKind }>>();
    for (const row of rows) {
      const list = out.get(row.skillId) ?? [];
      list.push({ title: row.title, url: row.url, kind: row.kind });
      out.set(row.skillId, list);
    }
    return out;
  }
}
