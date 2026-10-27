import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkillGapService } from './skill-gap.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('skill-gaps')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('skill-gaps')
export class SkillGapController {
  constructor(private readonly skillGaps: SkillGapService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.skillGaps.list(user.userId);
  }

  @Post('recalculate')
  recalculate(@CurrentUser() user: AuthUser) {
    return this.skillGaps.recalculate(user.userId);
  }
}
