import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Priority, Prisma, RequirementType } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { familyFromCareer, scoreLane } from '../ai/stack-lanes';
import { IngestEnqueueService } from '../queue/ingest-enqueue.service';
import {
  CareerRequirementDto,
  CreateCareerDto,
  CreateExamDto,
  CreateJobDto,
  CreateOpportunityDto,
  ExamSubjectDto,
  JobSkillDto,
  SkillDto,
  UpdateCareerDto,
  UpdateExamDto,
  UpdateJobDto,
  UpdateOpportunityDto,
  UpdateSkillDto,
} from './dto/admin-catalog.dto';

/**
 * Write access to platform catalog data: skills, careers, jobs, government exams
 * and government opportunities. Users only ever read these tables.
 */
@Injectable()
export class AdminCatalogService implements OnModuleInit {
  private readonly logger = new Logger(AdminCatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enqueue: IngestEnqueueService,
  ) {}

  async onModuleInit() {
    try {
      const result = await this.repairStackLanes();
      if (result.moved) this.logger.log(`Assigned ${result.moved} skills to a stack lane`);
    } catch (err) {
      this.logger.warn(`Stack lane repair skipped: ${(err as Error).message}`);
    }
  }

  private async skillIdByName(name: string, category?: string): Promise<string> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException({ error: 'SKILL_NAME_REQUIRED', message: 'Skill name is required' });
    }
    const skill = await this.prisma.skill.upsert({
      where: { name: trimmed },
      update: category ? { category } : {},
      create: { name: trimmed, category: category || 'General' },
    });
    return skill.id;
  }

  // ---------------------------------------------------------------- skills

  listSkills() {
    return this.prisma.skill.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  }

  createSkill(dto: SkillDto) {
    return this.prisma.skill.create({ data: { name: dto.name.trim(), category: dto.category } });
  }

  async updateSkill(id: string, dto: UpdateSkillDto) {
    await this.mustExist('skill', id);
    return this.prisma.skill.update({ where: { id }, data: dto });
  }

  async deleteSkill(id: string) {
    await this.mustExist('skill', id);
    await this.prisma.skill.delete({ where: { id } });
    return { deleted: true };
  }

  // --------------------------------------------------------------- careers

  listCareers() {
    return this.prisma.career.findMany({
      include: { requirements: { include: { skill: true } }, _count: { select: { goals: true } } },
      orderBy: { title: 'asc' },
    });
  }

  async createCareer(dto: CreateCareerDto) {
    const existing = await this.prisma.career.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new BadRequestException({ error: 'SLUG_TAKEN', message: 'A career with this slug already exists' });
    }
    const career = await this.prisma.career.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        overview: dto.overview,
        marketExpectations: dto.marketExpectations,
        entryLevelExpectations: dto.entryLevelExpectations,
        syllabusSlug: dto.syllabusSlug,
        coreTopics: dto.coreTopics ?? [],
        stackLanes: dto.stackLanes === undefined ? undefined : (dto.stackLanes as object),
      },
    });
    if (dto.requirements?.length) {
      await this.writeRequirements(career.id, dto.requirements);
    }
    const saved = await this.getCareer(career.id);
    try {
      const ingestRun = await this.enqueue.enqueueSingleCareer(career.id, 'CREATE');
      return { ...saved, ingestRun };
    } catch (err) {
      this.logger.warn(`Field ingest enqueue skipped for ${career.slug}: ${(err as Error).message}`);
      return saved;
    }
  }

  async updateCareer(id: string, dto: UpdateCareerDto) {
    await this.mustExist('career', id);
    await this.prisma.career.update({
      where: { id },
      data: {
        title: dto.title,
        slug: dto.slug,
        overview: dto.overview,
        marketExpectations: dto.marketExpectations,
        entryLevelExpectations: dto.entryLevelExpectations,
        syllabusSlug: dto.syllabusSlug,
        coreTopics: dto.coreTopics,
        stackLanes: dto.stackLanes === undefined ? undefined : (dto.stackLanes as object),
      },
    });
    return this.getCareer(id);
  }

  async replaceRequirements(id: string, requirements: CareerRequirementDto[]) {
    await this.mustExist('career', id);
    await this.prisma.careerSkillRequirement.deleteMany({ where: { careerId: id } });
    await this.writeRequirements(id, requirements);
    return this.getCareer(id);
  }

  async listLanes(careerId: string) {
    const career = await this.prisma.career.findUnique({
      where: { id: careerId },
      include: { requirements: { include: { skill: true }, orderBy: { skill: { name: 'asc' } } } },
    });
    if (!career) {
      throw new NotFoundException({ error: 'CAREER_NOT_FOUND', message: 'Career not found' });
    }
    const family = familyFromCareer(career);
    const groups = new Map<string, { id: string; label: string; skills: Array<Record<string, unknown>> }>();
    groups.set('core', { id: 'core', label: 'Core', skills: [] });
    for (const lane of family.lanes) {
      groups.set(lane.id, { id: lane.id, label: lane.label, skills: [] });
    }
    for (const req of career.requirements) {
      const key = req.stackLane ?? 'core';
      if (!groups.has(key)) groups.set(key, { id: key, label: key, skills: [] });
      groups.get(key)!.skills.push({
        id: req.id,
        skillId: req.skillId,
        name: req.skill.name,
        category: req.skill.category,
        importance: req.importance,
        type: req.type,
        layer: req.layer,
      });
    }
    return { careerId: career.id, title: career.title, slug: career.slug, lanes: [...groups.values()] };
  }

  async replaceLaneSkills(careerId: string, laneId: string, names: string[]) {
    const career = await this.prisma.career.findUnique({ where: { id: careerId } });
    if (!career) {
      throw new NotFoundException({ error: 'CAREER_NOT_FOUND', message: 'Career not found' });
    }
    const stackLane = laneId === 'core' ? null : laneId.trim();
    if (stackLane) {
      const known = familyFromCareer(career).lanes.some((lane) => lane.id === stackLane);
      if (!known) {
        throw new BadRequestException({ error: 'LANE_NOT_FOUND', message: `Stack ${stackLane} is not on this career` });
      }
    }
    const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
    await this.prisma.careerSkillRequirement.deleteMany({ where: { careerId, stackLane } });
    for (const name of unique) {
      const skillId = await this.skillIdByName(name, stackLane ? 'Stack' : 'Core');
      await this.prisma.careerSkillRequirement.create({
        data: {
          careerId,
          skillId,
          stackLane,
          layer: stackLane ? 'STACK_REQUIRED' : 'CORE',
          type: RequirementType.REQUIRED,
          importance: Priority.HIGH,
        },
      });
    }
    return this.listLanes(careerId);
  }

  async updateRequirement(
    id: string,
    dto: { skillName?: string; importance?: Priority; type?: RequirementType; layer?: string },
  ) {
    const row = await this.prisma.careerSkillRequirement.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({ error: 'REQUIREMENT_NOT_FOUND', message: 'Requirement not found' });
    }
    const skillId = dto.skillName?.trim() ? await this.skillIdByName(dto.skillName) : undefined;
    return this.prisma.careerSkillRequirement.update({
      where: { id },
      data: {
        skillId,
        importance: dto.importance,
        type: dto.type,
        layer: dto.layer,
      },
      include: { skill: true },
    });
  }

  async deleteRequirement(id: string) {
    const row = await this.prisma.careerSkillRequirement.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({ error: 'REQUIREMENT_NOT_FOUND', message: 'Requirement not found' });
    }
    await this.prisma.careerSkillRequirement.delete({ where: { id } });
    return { deleted: true };
  }

  /** Move a skill onto the one stack whose keywords match its name. Shared skills stay on core. */
  async repairStackLanes() {
    const careers = await this.prisma.career.findMany({
      include: { requirements: { include: { skill: true } } },
    });
    let moved = 0;
    for (const career of careers) {
      const family = familyFromCareer(career);
      if (!family.lanes.length) continue;
      for (const row of career.requirements) {
        if (row.stackLane && family.lanes.some((lane) => lane.id === row.stackLane)) continue;
        const hits = family.lanes.filter((lane) => scoreLane(row.skill.name, lane) > 0);
        if (hits.length !== 1) continue;
        const laneId = hits[0].id;
        const clash = career.requirements.some(
          (other) => other.id !== row.id && other.skillId === row.skillId && other.stackLane === laneId,
        );
        if (clash) continue;
        await this.prisma.careerSkillRequirement.update({
          where: { id: row.id },
          data: {
            stackLane: laneId,
            layer: row.layer.toUpperCase() === 'CORE' ? 'STACK_REQUIRED' : row.layer,
          },
        });
        row.stackLane = laneId;
        moved += 1;
      }
    }
    return { moved };
  }

  async deleteCareer(id: string) {
    const career = await this.prisma.career.findUnique({
      where: { id },
      include: { _count: { select: { goals: true } } },
    });
    if (!career) {
      throw new NotFoundException({ error: 'CAREER_NOT_FOUND', message: 'Career not found' });
    }
    if (career._count.goals > 0) {
      throw new BadRequestException({
        error: 'CAREER_IN_USE',
        message: `${career._count.goals} user goal(s) still point at this career. Reassign them first.`,
      });
    }
    await this.prisma.career.delete({ where: { id } });
    return { deleted: true };
  }

  private async writeRequirements(careerId: string, requirements: CareerRequirementDto[]) {
    for (const req of requirements) {
      const skillId = await this.skillIdByName(req.skillName, req.skillCategory);
      const existing = await this.prisma.careerSkillRequirement.findFirst({
        where: { careerId, skillId, stackLane: null },
      });
      if (existing) {
        await this.prisma.careerSkillRequirement.update({
          where: { id: existing.id },
          data: { importance: req.importance, type: req.type, stackLane: null, layer: 'CORE' },
        });
      } else {
        await this.prisma.careerSkillRequirement.create({
          data: { careerId, skillId, importance: req.importance, type: req.type, stackLane: null, layer: 'CORE' },
        });
      }
    }
  }

  private getCareer(id: string) {
    return this.prisma.career.findUniqueOrThrow({
      where: { id },
      include: { requirements: { include: { skill: true } } },
    });
  }

  // ------------------------------------------------------------------ jobs

  listJobs() {
    return this.prisma.job.findMany({
      include: { skills: { include: { skill: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createJob(dto: CreateJobDto) {
    const { skills, ...rest } = dto;
    const job = await this.prisma.job.create({ data: { ...rest, isDemo: false } });
    if (skills?.length) await this.writeJobSkills(job.id, skills);
    return this.getJob(job.id);
  }

  async updateJob(id: string, dto: UpdateJobDto) {
    await this.mustExist('job', id);
    const { skills, ...rest } = dto;
    await this.prisma.job.update({ where: { id }, data: rest });
    if (skills) {
      await this.prisma.jobSkill.deleteMany({ where: { jobId: id } });
      await this.writeJobSkills(id, skills);
    }
    return this.getJob(id);
  }

  async deleteJob(id: string) {
    await this.mustExist('job', id);
    await this.prisma.job.delete({ where: { id } });
    return { deleted: true };
  }

  private async writeJobSkills(jobId: string, skills: JobSkillDto[]) {
    for (const s of skills) {
      const skillId = await this.skillIdByName(s.skillName);
      await this.prisma.jobSkill.upsert({
        where: { jobId_skillId: { jobId, skillId } },
        update: { isMissing: s.isMissing ?? false },
        create: { jobId, skillId, isMissing: s.isMissing ?? false },
      });
    }
  }

  private getJob(id: string) {
    return this.prisma.job.findUniqueOrThrow({
      where: { id },
      include: { skills: { include: { skill: true } } },
    });
  }

  // ------------------------------------------------------- government exams

  listExams() {
    return this.prisma.governmentExam.findMany({
      include: { subjects: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { shortName: 'asc' },
    });
  }

  async createExam(dto: CreateExamDto) {
    const existing = await this.prisma.governmentExam.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new BadRequestException({ error: 'SLUG_TAKEN', message: 'An exam with this slug already exists' });
    }
    const { subjects, examPattern, ...rest } = dto;
    const exam = await this.prisma.governmentExam.create({
      data: { ...rest, examPattern: (examPattern ?? undefined) as Prisma.InputJsonValue },
    });
    if (subjects?.length) await this.writeSubjects(exam.id, subjects);
    return this.getExam(exam.id);
  }

  async updateExam(id: string, dto: UpdateExamDto) {
    await this.mustExist('governmentExam', id);
    const { examPattern, ...rest } = dto;
    await this.prisma.governmentExam.update({
      where: { id },
      data: { ...rest, ...(examPattern ? { examPattern: examPattern as Prisma.InputJsonValue } : {}) },
    });
    return this.getExam(id);
  }

  async replaceSubjects(id: string, subjects: ExamSubjectDto[]) {
    await this.mustExist('governmentExam', id);
    await this.prisma.governmentExamSubject.deleteMany({ where: { examId: id } });
    await this.writeSubjects(id, subjects);
    return this.getExam(id);
  }

  async deleteExam(id: string) {
    await this.mustExist('governmentExam', id);
    await this.prisma.governmentExam.delete({ where: { id } });
    return { deleted: true };
  }

  private async writeSubjects(examId: string, subjects: ExamSubjectDto[]) {
    await this.prisma.governmentExamSubject.createMany({
      data: subjects.map((s, i) => ({
        examId,
        name: s.name,
        weightage: s.weightage ?? null,
        topics: s.topics ?? [],
        sortOrder: s.sortOrder ?? i,
      })),
    });
  }

  private getExam(id: string) {
    return this.prisma.governmentExam.findUniqueOrThrow({
      where: { id },
      include: { subjects: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  // ----------------------------------------------- government opportunities

  listOpportunities() {
    return this.prisma.governmentOpportunity.findMany({ orderBy: { createdAt: 'desc' } });
  }

  createOpportunity(dto: CreateOpportunityDto) {
    return this.prisma.governmentOpportunity.create({ data: dto });
  }

  async updateOpportunity(id: string, dto: UpdateOpportunityDto) {
    await this.mustExist('governmentOpportunity', id);
    return this.prisma.governmentOpportunity.update({ where: { id }, data: dto });
  }

  async deleteOpportunity(id: string) {
    await this.mustExist('governmentOpportunity', id);
    await this.prisma.governmentOpportunity.delete({ where: { id } });
    return { deleted: true };
  }

  // ----------------------------------------------------------------- shared

  private async mustExist(
    model: 'skill' | 'career' | 'job' | 'governmentExam' | 'governmentOpportunity',
    id: string,
  ) {
    const found = await this.findById(model, id);
    if (!found) {
      throw new NotFoundException({
        error: 'NOT_FOUND',
        message: `${model} ${id} not found`,
      });
    }
  }

  private findById(
    model: 'skill' | 'career' | 'job' | 'governmentExam' | 'governmentOpportunity',
    id: string,
  ): Promise<{ id: string } | null> {
    switch (model) {
      case 'skill':
        return this.prisma.skill.findUnique({ where: { id }, select: { id: true } });
      case 'career':
        return this.prisma.career.findUnique({ where: { id }, select: { id: true } });
      case 'job':
        return this.prisma.job.findUnique({ where: { id }, select: { id: true } });
      case 'governmentExam':
        return this.prisma.governmentExam.findUnique({ where: { id }, select: { id: true } });
      case 'governmentOpportunity':
        return this.prisma.governmentOpportunity.findUnique({ where: { id }, select: { id: true } });
    }
  }
}
