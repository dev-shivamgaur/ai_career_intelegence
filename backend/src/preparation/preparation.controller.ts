import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AttemptDto, HintDto, StartPrepDto, TaskEvidenceDto } from './preparation.dto';
import { PreparationService } from './preparation.service';

@ApiTags('preparation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('preparation')
export class PreparationController {
  constructor(private readonly preparation: PreparationService) {}

  @Get('packages')
  packages(@CurrentUser() user: AuthUser, @Query('skillId') skillId?: string) {
    return this.preparation.listPackages(user.userId, skillId ?? '');
  }

  @Post('sessions')
  start(@CurrentUser() user: AuthUser, @Body() dto: StartPrepDto) {
    return this.preparation.start(user.userId, dto);
  }

  @Get('sessions/current')
  current(@CurrentUser() user: AuthUser, @Query('skillId') skillId?: string) {
    return this.preparation.current(user.userId, skillId ?? '');
  }

  @Get('usage')
  usage(@CurrentUser() user: AuthUser) {
    return this.preparation.usage(user.userId);
  }

  @Post('sessions/:id/lessons/:lessonKey/complete')
  completeLesson(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('lessonKey') lessonKey: string) {
    return this.preparation.completeLesson(user.userId, id, lessonKey);
  }

  @Post('sessions/:id/attempts')
  attempt(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AttemptDto) {
    return this.preparation.submitAttempt(user.userId, id, dto);
  }

  @Get('sessions/:id/history')
  history(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.preparation.history(user.userId, id);
  }

  @Post('sessions/:id/tasks')
  task(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TaskEvidenceDto) {
    return this.preparation.submitTask(user.userId, id, dto);
  }

  @Post('sessions/:id/hint')
  hint(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: HintDto) {
    return this.preparation.hint(user.userId, id, dto);
  }

  @Post('sessions/:id/apply')
  apply(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.preparation.apply(user.userId, id);
  }
}
