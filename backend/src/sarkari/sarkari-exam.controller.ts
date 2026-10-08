import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TaskStatus } from '../prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { SarkariExamService } from './sarkari-exam.service';

class StartExamPlanDto {
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(480)
  dailyMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(2026)
  @Max(2035)
  targetYear?: number;
}

class UpdateExamTopicDto {
  @IsString()
  examSlug!: string;

  @IsString()
  subjectId!: string;

  @IsString()
  topic!: string;

  @IsEnum(TaskStatus)
  status!: TaskStatus;
}

class LogMockDto {
  @IsString()
  examSlug!: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsInt()
  @Min(0)
  @Max(100)
  scorePercent!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

@ApiTags('government-exams')
@Controller('government-exams')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SarkariExamController {
  constructor(private readonly exams: SarkariExamService) {}

  @Get()
  list() {
    return this.exams.list();
  }

  @Get('me/plan')
  myPlan(@CurrentUser() user: AuthUser) {
    return this.exams.myPlan(user.userId);
  }

  @Get(':slug/mocks')
  mocks(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.exams.listMocks(user.userId, slug);
  }

  @Get(':slug')
  get(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.exams.get(slug, user.userId);
  }

  @Post(':slug/plan')
  start(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: StartExamPlanDto,
  ) {
    return this.exams.startPlan(user.userId, slug, dto.dailyMinutes, dto.targetYear);
  }

  @Post('mocks')
  logMock(@CurrentUser() user: AuthUser, @Body() dto: LogMockDto) {
    return this.exams.logMock(user.userId, dto);
  }

  @Patch('progress')
  progress(@CurrentUser() user: AuthUser, @Body() dto: UpdateExamTopicDto) {
    return this.exams.updateTopic(user.userId, dto);
  }
}
