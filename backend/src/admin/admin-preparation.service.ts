import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { LlmService } from '../ai/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { PrepPackageStatus, Prisma } from '../prisma/client';
import {
  buildDeterministicPackage,
  genericCareerScope,
  hashPackage,
  keepKnownResources,
} from '../preparation/package-builder';
import {
  prepContentSchema,
  prepRubricSchema,
  toLearnerContent,
  validatePrepPackage,
} from '../preparation/package.schema';

const draftFillSchema = z.object({
  explanation: z.string().min(8).max(4000),
  examples: z.array(z.string().max(500)).max(4),
  mistakes: z.array(z.string().max(500)).max(4),
});

@Injectable()
export class AdminPreparationService {
  private readonly logger = new Logger(AdminPreparationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  async list(skillId?: string, status?: PrepPackageStatus) {
    const rows = await this.prisma.prepPackage.findMany({
      where: {
        ...(skillId ? { skillId } : {}),
        ...(status ? { status } : {}),
      },
      include: { skill: { select: { id: true, name: true, category: true } } },
      orderBy: [{ skillId: 'asc' }, { version: 'desc' }],
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      skillId: row.skillId,
      skillName: row.skill.name,
      skillCategory: row.skill.category,
      careerScope: row.careerScope,
      version: row.version,
      status: row.status,
      contentHash: row.contentHash,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      publishedAt: row.publishedAt,
      skillNameFromContent: (row.content as { skillName?: string })?.skillName ?? row.skill.name,
      lessonCount: Array.isArray((row.content as { lessons?: unknown[] })?.lessons)
        ? (row.content as { lessons: unknown[] }).lessons.length
        : 0,
    }));
  }

  async get(id: string) {
    const row = await this.prisma.prepPackage.findUnique({
      where: { id },
      include: { skill: { select: { id: true, name: true } } },
    });
    if (!row) throw new NotFoundException({ error: 'PREP_PACKAGE_NOT_FOUND', message: 'Package not found' });
    const content = prepContentSchema.parse(row.content);
    const rubric = prepRubricSchema.parse(row.rubric);
    return {
      id: row.id,
      skillId: row.skillId,
      skillName: row.skill.name,
      careerScope: row.careerScope,
      version: row.version,
      status: row.status,
      contentHash: row.contentHash,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      publishedAt: row.publishedAt,
      content,
      rubric,
      validationErrors: validatePrepPackage(content, rubric),
    };
  }

  async createDraft(skillId: string, conceptual?: boolean) {
    const skill = await this.prisma.skill.findUnique({ where: { id: skillId } });
    if (!skill) throw new NotFoundException({ error: 'SKILL_NOT_FOUND', message: 'Skill not found' });
    const resources = await this.prisma.learningResource.findMany({
      where: { skillId, active: true },
      select: { title: true, url: true, kind: true },
    });
    const relations = await this.prisma.skillRelation.findMany({
      where: { skillId },
      include: { related: { select: { id: true, name: true } } },
    });
    const built = buildDeterministicPackage({
      skillId: skill.id,
      skillName: skill.name,
      careerTitle: 'your target role',
      prerequisites: relations.map((row) => ({ skillId: row.related.id, name: row.related.name })),
      resources,
      dailyHours: null,
      phase: 'D30',
      conceptual: Boolean(conceptual),
    });
    const latest = await this.prisma.prepPackage.findFirst({
      where: { skillId, careerScope: genericCareerScope() },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const created = await this.prisma.prepPackage.create({
      data: {
        skillId,
        careerScope: genericCareerScope(),
        version: (latest?.version ?? 0) + 1,
        content: built.content as Prisma.InputJsonValue,
        rubric: built.rubric as Prisma.InputJsonValue,
        contentHash: built.contentHash,
        status: PrepPackageStatus.DRAFT,
      },
    });
    return this.get(created.id);
  }

  async updateDraft(id: string, body: { content: unknown; rubric: unknown }) {
    const row = await this.prisma.prepPackage.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ error: 'PREP_PACKAGE_NOT_FOUND', message: 'Package not found' });
    if (row.status !== PrepPackageStatus.DRAFT) {
      throw new BadRequestException({ error: 'PREP_NOT_DRAFT', message: 'Only draft packages can be edited in place' });
    }
    const content = prepContentSchema.parse(body.content);
    const rubric = prepRubricSchema.parse(body.rubric);
    const contentHash = hashPackage(content, rubric);
    await this.prisma.prepPackage.update({
      where: { id },
      data: {
        content: content as Prisma.InputJsonValue,
        rubric: rubric as Prisma.InputJsonValue,
        contentHash,
      },
    });
    return this.get(id);
  }

  async validate(id: string) {
    const pkg = await this.get(id);
    return { id: pkg.id, ok: pkg.validationErrors.length === 0, errors: pkg.validationErrors };
  }

  async preview(id: string) {
    const pkg = await this.get(id);
    return { id: pkg.id, version: pkg.version, status: pkg.status, package: toLearnerContent(pkg.content) };
  }

  async publish(id: string) {
    const row = await this.prisma.prepPackage.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ error: 'PREP_PACKAGE_NOT_FOUND', message: 'Package not found' });
    const content = prepContentSchema.parse(row.content);
    const rubric = prepRubricSchema.parse(row.rubric);
    const errors = validatePrepPackage(content, rubric);
    if (errors.length) {
      throw new BadRequestException({ error: 'PREP_INVALID', message: 'Package failed validation', errors });
    }
    if (row.status === PrepPackageStatus.DRAFT) {
      const published = await this.prisma.prepPackage.update({
        where: { id },
        data: { status: PrepPackageStatus.PUBLISHED, publishedAt: new Date(), contentHash: hashPackage(content, rubric) },
      });
      return this.get(published.id);
    }
    const latest = await this.prisma.prepPackage.findFirst({
      where: { skillId: row.skillId, careerScope: row.careerScope },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const created = await this.prisma.prepPackage.create({
      data: {
        skillId: row.skillId,
        careerScope: row.careerScope,
        version: (latest?.version ?? row.version) + 1,
        content: content as Prisma.InputJsonValue,
        rubric: rubric as Prisma.InputJsonValue,
        contentHash: hashPackage(content, rubric),
        status: PrepPackageStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
    return this.get(created.id);
  }

  async generateDraft(id: string) {
    const row = await this.prisma.prepPackage.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ error: 'PREP_PACKAGE_NOT_FOUND', message: 'Package not found' });
    if (row.status !== PrepPackageStatus.DRAFT) {
      throw new BadRequestException({ error: 'PREP_NOT_DRAFT', message: 'Generate only fills draft packages' });
    }
    const content = prepContentSchema.parse(row.content);
    const rubric = prepRubricSchema.parse(row.rubric);
    if (!this.llm.isConfigured()) {
      throw new BadRequestException({ error: 'LLM_UNAVAILABLE', message: 'AI provider is not configured' });
    }
    const known = new Set(content.resources.map((r) => r.url));
    try {
      const parsed = draftFillSchema.parse(
        await this.llm.structured(
          draftFillSchema,
          [
            new SystemMessage('Write a short practice explanation for one skill. Do not invent URLs. Do not include answer keys.'),
            new HumanMessage(`Skill: ${content.skillName}. Career: ${content.careerTitle}.`),
          ],
          { temperature: 0, timeoutMs: 90_000, label: 'Admin prep generate' },
        ),
      );
      const next = keepKnownResources({
        ...content,
        lessons: content.lessons.map((lesson, index) =>
          index === 0
            ? { ...lesson, explanation: parsed.explanation, examples: parsed.examples, mistakes: parsed.mistakes }
            : lesson,
        ),
      }, known);
      const parsedContent = prepContentSchema.parse(next);
      await this.prisma.prepPackage.update({
        where: { id },
        data: {
          content: parsedContent as Prisma.InputJsonValue,
          contentHash: hashPackage(parsedContent, rubric),
        },
      });
    } catch (err) {
      this.logger.warn(`Admin generate failed: ${(err as Error).message}`);
      throw new BadRequestException({ error: 'PREP_GENERATE_FAILED', message: (err as Error).message });
    }
    return this.get(id);
  }
}
