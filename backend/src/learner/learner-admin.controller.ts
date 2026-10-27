import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, IsUrl } from 'class-validator';
import { Role } from '../prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CompanyIntelService } from './company-intel.service';
import { LearningResourceService } from './learning-resource.service';
import { PrismaService } from '../prisma/prisma.service';

class ResourceDto {
  @IsString()
  skillId!: string;

  @IsString()
  title!: string;

  @IsUrl({ require_protocol: true })
  url!: string;

  @IsIn(['DOC', 'TUTORIAL', 'PRACTICE'])
  kind!: 'DOC' | 'TUTORIAL' | 'PRACTICE';
}

class RelationDto {
  @IsString()
  skillId!: string;

  @IsString()
  relatedSkillId!: string;
}

@ApiTags('admin-learner')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/learner')
export class LearnerAdminController {
  constructor(
    private readonly companies: CompanyIntelService,
    private readonly resources: LearningResourceService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('companies')
  companyView() {
    return this.companies.list();
  }

  @Get('resources')
  resourcesList(@Query('skillId') skillId?: string) {
    return this.resources.list(skillId);
  }

  @Post('resources')
  createResource(@Body() dto: ResourceDto) {
    return this.resources.create(dto);
  }

  @Delete('resources/:id')
  disableResource(@Param('id') id: string) {
    return this.resources.disable(id);
  }

  @Get('relations')
  relations() {
    return this.prisma.skillRelation.findMany({
      include: { skill: { select: { name: true } }, related: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post('relations')
  createRelation(@Body() dto: RelationDto) {
    return this.prisma.skillRelation.create({ data: { skillId: dto.skillId, relatedSkillId: dto.relatedSkillId, kind: 'PREREQUISITE' } });
  }
}
