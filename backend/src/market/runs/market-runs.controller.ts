import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { MarketRunKind, Role } from '../../prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MarketFetchService } from '../ingest/market-fetch.service';
import { MarketRetentionService } from '../retention/market-retention.service';
import { MarketHealthService } from './market-health.service';
import { MarketRunService } from './market-run.service';

export class StartFetchDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  sourceIds?: string[];

  @IsOptional()
  @IsIn(['due', 'all'])
  selection?: 'due' | 'all';
}

export class PurgeDto {
  @IsIn(['policy', 'full'])
  mode!: 'policy' | 'full';
}

@ApiTags('admin-market')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/market')
export class MarketRunsController {
  constructor(
    private readonly runs: MarketRunService,
    private readonly fetch: MarketFetchService,
    private readonly retention: MarketRetentionService,
    private readonly healthService: MarketHealthService,
  ) {}

  @Get('runs')
  listRuns(@Query('kind') kind?: string) {
    const valid = kind && (Object.values(MarketRunKind) as string[]).includes(kind) ? (kind as MarketRunKind) : undefined;
    return this.runs.listRuns(valid);
  }

  @Get('runs/:id')
  async getRun(@Param('id') id: string) {
    const run = await this.runs.getRun(id);
    if (!run) throw new NotFoundException({ error: 'RUN_NOT_FOUND', message: 'Market run not found' });
    return run;
  }

  /** "Run now": explicit sourceIds, or every enabled source ("all"), or only due ones (default). */
  @Post('runs/fetch')
  startFetch(@Body() dto: StartFetchDto) {
    return this.fetch.startFetchRun('ADMIN', dto.sourceIds?.length ? dto.sourceIds : (dto.selection ?? 'due'));
  }

  @Post('runs/retention')
  startRetention() {
    return this.retention.startRetentionRun('ADMIN');
  }

  @Get('health')
  health() {
    return this.healthService.health();
  }

  @Post('sources/:id/purge')
  purge(@Param('id') id: string, @Body() dto: PurgeDto) {
    return this.retention.purgeSource(id, dto.mode);
  }
}
