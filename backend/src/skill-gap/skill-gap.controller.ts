import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkillGapService } from './skill-gap.service';
import { PracticeSkillGapDto } from './dto/practice.dto';
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

  @Get(':id/lesson')
  lesson(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('phase') phase?: string) {
    return this.skillGaps.lesson(user.userId, id, phase);
  }

  @Post(':id/practice')
  practice(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PracticeSkillGapDto) {
    return this.skillGaps.practice(user.userId, id, dto.note, dto.answers);
  }
}
