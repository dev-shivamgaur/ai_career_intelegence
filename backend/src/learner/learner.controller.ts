import { Body, Controller, Delete, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsUrl } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GithubEvidenceService } from './github-evidence.service';
import { learnerFlags } from './learner.flags';
import { PersonalRoadmapService } from './personal-roadmap.service';
import { ReadinessService } from './readiness.service';
import { SkillEvidenceService } from './skill-evidence.service';

class GithubScanDto {
  @IsUrl({ require_protocol: true })
  url!: string;
}

@ApiTags('learner')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('learner')
export class LearnerController {
  constructor(
    private readonly evidence: SkillEvidenceService,
    private readonly github: GithubEvidenceService,
    private readonly readiness: ReadinessService,
    private readonly personal: PersonalRoadmapService,
  ) {}

  @Get('evidence')
  evidenceList(@CurrentUser() user: AuthUser) {
    return this.evidence.listForUser(user.userId);
  }

  @Delete('evidence/:id')
  removeEvidence(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.evidence.remove(user.userId, id);
  }

  @Get('github')
  githubLinks(@CurrentUser() user: AuthUser) {
    return this.github.list(user.userId);
  }

  @Post('github/scan')
  scan(@CurrentUser() user: AuthUser, @Body() dto: GithubScanDto) {
    return this.github.scan(user.userId, dto.url);
  }

  @Delete('github/:id')
  disconnect(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.github.disconnect(user.userId, id);
  }

  @Get('readiness')
  readinessView(@CurrentUser() user: AuthUser) {
    if (!learnerFlags.readiness()) {
      throw new NotFoundException({ error: 'READINESS_UI_DISABLED', message: 'Readiness view is not enabled' });
    }
    return this.readiness.forUser(user.userId);
  }

  @Get('personal-roadmap')
  async personalPlan(@CurrentUser() user: AuthUser) {
    if (!learnerFlags.personalRoadmap()) this.personalOff();
    return { plan: await this.personal.current(user.userId) };
  }

  @Post('personal-roadmap/generate')
  generatePersonal(@CurrentUser() user: AuthUser) {
    if (!learnerFlags.personalRoadmap()) this.personalOff();
    return this.personal.generate(user.userId);
  }

  @Post('personal-roadmap/apply')
  applyPersonal(@CurrentUser() user: AuthUser) {
    if (!learnerFlags.personalRoadmap()) this.personalOff();
    return this.personal.apply(user.userId);
  }

  private personalOff(): never {
    throw new NotFoundException({ error: 'PERSONALIZED_ROADMAP_DISABLED', message: 'Personal roadmap is not enabled' });
  }
}
