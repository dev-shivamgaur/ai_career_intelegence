import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { SarkariJudgeService } from './sarkari-judge.service';
import { SarkariInternetService } from './sarkari-internet.service';

@ApiTags('sarkari')
@Controller('sarkari')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SarkariController {
  constructor(
    private readonly judge: SarkariJudgeService,
    private readonly internet: SarkariInternetService,
  ) {}

  @Get('judge')
  snapshot(@CurrentUser() user: AuthUser) {
    return this.judge.forUser(user.userId);
  }

  @Post('internet/refresh')
  refresh(@CurrentUser() user: AuthUser) {
    return this.internet.refreshForUser(user.userId);
  }
}
