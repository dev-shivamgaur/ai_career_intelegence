import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '../prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminCatalogService } from './admin-catalog.service';
import { IngestEnqueueService } from '../queue/ingest-enqueue.service';
import {
  CreateCareerDto,
  CreateExamDto,
  CreateJobDto,
  CreateOpportunityDto,
  ReplaceLaneSkillsDto,
  ReplaceRequirementsDto,
  UpdateRequirementDto,
  ReplaceSubjectsDto,
  SkillDto,
  UpdateCareerDto,
  UpdateExamDto,
  UpdateJobDto,
  UpdateOpportunityDto,
  UpdateSkillDto,
} from './dto/admin-catalog.dto';

@ApiTags('admin-catalog')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminCatalogController {
  constructor(
    private readonly catalog: AdminCatalogService,
    private readonly enqueue: IngestEnqueueService,
  ) {}

  @Get('skills')
  listSkills() {
    return this.catalog.listSkills();
  }

  @Post('skills')
  createSkill(@Body() dto: SkillDto) {
    return this.catalog.createSkill(dto);
  }

  @Patch('skills/:id')
  updateSkill(@Param('id') id: string, @Body() dto: UpdateSkillDto) {
    return this.catalog.updateSkill(id, dto);
  }

  @Delete('skills/:id')
  deleteSkill(@Param('id') id: string) {
    return this.catalog.deleteSkill(id);
  }

  @Get('careers')
  listCareers() {
    return this.catalog.listCareers();
  }

  @Post('careers')
  createCareer(@Body() dto: CreateCareerDto) {
    return this.catalog.createCareer(dto);
  }

  @Post('careers/:id/refresh-topics')
  refreshTopics(@Param('id') id: string) {
    return this.enqueue.enqueueSingleCareer(id, 'ADMIN');
  }

  @Patch('careers/:id')
  updateCareer(@Param('id') id: string, @Body() dto: UpdateCareerDto) {
    return this.catalog.updateCareer(id, dto);
  }

  @Get('careers/:id/lanes')
  listLanes(@Param('id') id: string) { 
    return this.catalog.listLanes(id);
  }

  @Put('careers/:id/lanes/:laneId/skills')
  replaceLaneSkills(@Param('id') id: string, @Param('laneId') laneId: string, @Body() dto: ReplaceLaneSkillsDto) {
    const fromText = (dto.text ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    const names = dto.skills?.length ? dto.skills : fromText;
    return this.catalog.replaceLaneSkills(id, laneId, names);
  }

  @Patch('requirements/:id')
  updateRequirement(@Param('id') id: string, @Body() dto: UpdateRequirementDto) {
    return this.catalog.updateRequirement(id, dto);
  }

  @Delete('requirements/:id')
  deleteRequirement(@Param('id') id: string) {
    return this.catalog.deleteRequirement(id);
  }

  @Put('careers/:id/requirements')
  replaceRequirements(@Param('id') id: string, @Body() dto: ReplaceRequirementsDto) {
    return this.catalog.replaceRequirements(id, dto.requirements);
  }

  @Delete('careers/:id')
  deleteCareer(@Param('id') id: string) {
    return this.catalog.deleteCareer(id);
  }

  @Get('jobs')
  listJobs() {
    return this.catalog.listJobs();
  }

  @Post('jobs')
  createJob(@Body() dto: CreateJobDto) {
    return this.catalog.createJob(dto);
  }

  @Patch('jobs/:id')
  updateJob(@Param('id') id: string, @Body() dto: UpdateJobDto) {
    return this.catalog.updateJob(id, dto);
  }

  @Delete('jobs/:id')
  deleteJob(@Param('id') id: string) {
    return this.catalog.deleteJob(id);
  }

  @Get('government-exams')
  listExams() {
    return this.catalog.listExams();
  }

  @Post('government-exams')
  createExam(@Body() dto: CreateExamDto) {
    return this.catalog.createExam(dto);
  }

  @Patch('government-exams/:id')
  updateExam(@Param('id') id: string, @Body() dto: UpdateExamDto) {
    return this.catalog.updateExam(id, dto);
  }

  @Put('government-exams/:id/subjects')
  replaceSubjects(@Param('id') id: string, @Body() dto: ReplaceSubjectsDto) {
    return this.catalog.replaceSubjects(id, dto.subjects);
  }

  @Delete('government-exams/:id')
  deleteExam(@Param('id') id: string) {
    return this.catalog.deleteExam(id);
  }

  @Get('government-opportunities')
  listOpportunities() {
    return this.catalog.listOpportunities();
  }

  @Post('government-opportunities')
  createOpportunity(@Body() dto: CreateOpportunityDto) {
    return this.catalog.createOpportunity(dto);
  }

  @Patch('government-opportunities/:id')
  updateOpportunity(@Param('id') id: string, @Body() dto: UpdateOpportunityDto) {
    return this.catalog.updateOpportunity(id, dto);
  }

  @Delete('government-opportunities/:id')
  deleteOpportunity(@Param('id') id: string) {
    return this.catalog.deleteOpportunity(id);
  }
}
