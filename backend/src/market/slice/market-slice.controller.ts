import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Role } from '../../prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { SkillCandidateService } from '../candidates/skill-candidate.service';
import { MarketProcessService } from '../process/market-process.service';
import { MarketSliceService } from './market-slice.service';

export class CareerProfileDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  titlePatterns!: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  excludePatterns!: string[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ReclassifyDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  sourceIds?: string[];
}

@ApiTags('admin-market')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/market')
export class MarketSliceController {
  constructor(
    private readonly slice: MarketSliceService,
    private readonly candidates: SkillCandidateService,
    private readonly pipeline: MarketProcessService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('slice')
  summary() {
    return this.slice.summary();
  }

  @Get('slice/careers/:careerId/skills')
  careerSkills(@Param('careerId') careerId: string, @Query('take') take?: string) {
    return this.slice.careerSkills(careerId, take ? Number(take) : undefined);
  }

  @Get('slice/careers/:careerId/skills/:key/jobs')
  skillJobs(@Param('careerId') careerId: string, @Param('key') key: string, @Query('take') take?: string) {
    return this.slice.skillJobs(careerId, key, take ? Number(take) : undefined);
  }

  @Get('candidates')
  listCandidates(@Query('status') status?: string, @Query('q') q?: string, @Query('skip') skip?: string, @Query('take') take?: string) {
    return this.candidates.list({ status, q, skip: skip ? Number(skip) : undefined, take: take ? Number(take) : undefined });
  }

  @Get('careers')
  careerProfiles() {
    return this.slice.careerProfiles();
  }

  @Put('careers/:careerId/profile')
  saveProfile(@Param('careerId') careerId: string, @Body() dto: CareerProfileDto, @CurrentUser() actor: AuthUser) {
    return this.slice.saveProfile(careerId, dto, actor.userId);
  }

  /** Re-runs classification only (e.g. after editing title patterns). Defaults to every source with jobs. */
  @Post('runs/reclassify')
  async reclassify(@Body() dto: ReclassifyDto) {
    const sourceIds =
      dto.sourceIds && dto.sourceIds.length
        ? dto.sourceIds
        : (await this.prisma.marketSource.findMany({ where: { rawJobs: { some: {} } }, select: { id: true } })).map((s) => s.id);
    if (!sourceIds.length) return { runId: null, taskCount: 0 };
    return this.pipeline.startReprocessRun('ADMIN', sourceIds, 'classify');
  }
}
