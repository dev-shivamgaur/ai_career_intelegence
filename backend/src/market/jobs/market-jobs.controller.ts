import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';
import { Role } from '../../prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MarketProcessService } from '../process/market-process.service';
import { MarketJobsService } from './market-jobs.service';

export class ReprocessDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  sourceIds!: string[];
}

@ApiTags('admin-market')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/market')
export class MarketJobsController {
  constructor(
    private readonly jobs: MarketJobsService,
    private readonly pipeline: MarketProcessService,
  ) {}

  @Get('companies/postings')
  companyPostings() {
    return this.jobs.companySummary();
  }

  @Get('jobs')
  list(
    @Query('companyId') companyId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.jobs.list({ companyId, status, q, skip: skip ? Number(skip) : undefined, take: take ? Number(take) : undefined });
  }

  @Get('jobs/merges')
  merges() {
    return this.jobs.merges();
  }

  @Get('jobs/:id')
  async detail(@Param('id') id: string) {
    const job = await this.jobs.detail(id);
    if (!job) throw new NotFoundException({ error: 'MARKET_JOB_NOT_FOUND', message: 'Market job not found' });
    return job;
  }

  @Get('pipeline/stages')
  stages() {
    return { stages: this.pipeline.stageNames() };
  }

  @Post('runs/reprocess')
  reprocess(@Body() dto: ReprocessDto) {
    return this.pipeline.startReprocessRun('ADMIN', dto.sourceIds);
  }
}
