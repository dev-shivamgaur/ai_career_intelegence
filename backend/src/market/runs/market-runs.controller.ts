import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MarketRunKind, MarketTaskStatus, Role } from '../../prisma/client';
import { MarketRabbitConnection } from '../queue/market-rabbit.connection';
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

export class QueueActionDto {
  @IsString()
  queue!: string;

  @IsInt()
  @Min(1)
  @Max(50)
  count!: number;
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
    private readonly rabbit: MarketRabbitConnection,
  ) {}

  @Get('runs')
  listRuns(@Query('kind') kind?: string, @Query('skip') skip?: string, @Query('take') take?: string) {
    const valid = kind && (Object.values(MarketRunKind) as string[]).includes(kind) ? (kind as MarketRunKind) : undefined;
    return this.runs.listRuns(valid, take ? Number(take) : 20, skip ? Number(skip) : 0);
  }

  @Get('tasks')
  listTasks(@Query('status') status?: string, @Query('kind') kind?: string, @Query('skip') skip?: string, @Query('take') take?: string) {
    const taskStatus = status && (Object.values(MarketTaskStatus) as string[]).includes(status) ? (status as MarketTaskStatus) : undefined;
    const runKind = kind && (Object.values(MarketRunKind) as string[]).includes(kind) ? (kind as MarketRunKind) : undefined;
    return this.runs.listTasks({
      status: taskStatus,
      kind: runKind,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 20,
    });
  }

  @Get('queues/messages')
  queueMessages(@Query('queue') queue?: string, @Query('take') take?: string) {
    if (!queue || !this.rabbit.knownQueue(queue)) {
      throw new BadRequestException({ error: 'UNKNOWN_QUEUE', message: 'Unknown market queue' });
    }
    return this.rabbit.peek(queue, take ? Number(take) : 20);
  }

  @Post('queues/requeue')
  async requeue(@Body() dto: QueueActionDto) {
    if (!dto.queue.endsWith('.dlq') || !this.rabbit.knownQueue(dto.queue)) {
      throw new BadRequestException({ error: 'NOT_A_DLQ', message: 'Only a market dead-letter queue can be replayed' });
    }
    const preview = await this.rabbit.peek(dto.queue, dto.count);
    const taskIds = preview
      .map((row) => (row.body && typeof row.body === 'object' && 'taskId' in row.body ? String((row.body as { taskId?: string }).taskId ?? '') : ''))
      .filter(Boolean);
    const reopened = await this.runs.reopenFailed(taskIds);
    const moved = await this.rabbit.requeue(dto.queue, dto.count);
    return { moved, ...reopened };
  }

  @Post('queues/drop')
  drop(@Body() dto: QueueActionDto) {
    if (!this.rabbit.knownQueue(dto.queue)) {
      throw new BadRequestException({ error: 'UNKNOWN_QUEUE', message: 'Unknown market queue' });
    }
    return this.rabbit.drop(dto.queue, dto.count).then((dropped) => ({ dropped }));
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
