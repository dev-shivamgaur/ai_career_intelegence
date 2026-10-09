import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Role } from '../../prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SkillReviewService } from './skill-review.service';
import { SkillSuggestService } from './skill-suggest.service';

export class SuggestDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class MapCandidateDto {
  @IsString()
  skillId!: string;
}

export class ApproveCandidateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsString()
  domainId?: string;
}

export class RejectCandidateDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class AddAliasDto {
  @IsString()
  skillId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  alias!: string;
}

export class MergeSkillsDto {
  @IsString()
  sourceSkillId!: string;

  @IsString()
  targetSkillId!: string;

  /** Defaults to a dry run. */
  @IsOptional()
  @IsBoolean()
  execute?: boolean;
}

@ApiTags('admin-market')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/market')
export class SkillReviewController {
  constructor(
    private readonly review: SkillReviewService,
    private readonly suggest: SkillSuggestService,
  ) {}

  @Post('candidates/suggest')
  suggestPending(@Body() dto: SuggestDto) {
    return this.suggest.suggestPending(dto.limit);
  }

  @Post('candidates/:id/map')
  map(@Param('id') id: string, @Body() dto: MapCandidateDto, @CurrentUser() actor: AuthUser) {
    return this.review.mapToSkill(id, dto.skillId, actor.userId);
  }

  @Post('candidates/:id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveCandidateDto, @CurrentUser() actor: AuthUser) {
    return this.review.approveAsNew(id, dto, actor.userId);
  }

  @Post('candidates/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectCandidateDto, @CurrentUser() actor: AuthUser) {
    return this.review.reject(id, dto.note, actor.userId);
  }

  @Post('candidates/:id/reopen')
  reopen(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.review.reopen(id, actor.userId);
  }

  @Get('aliases')
  aliases(@Query('q') q?: string, @Query('skillId') skillId?: string, @Query('take') take?: string) {
    return this.review.listAliases({ q, skillId, take: take ? Number(take) : undefined });
  }

  @Post('aliases')
  addAlias(@Body() dto: AddAliasDto, @CurrentUser() actor: AuthUser) {
    return this.review.addAlias(dto.skillId, dto.alias, actor.userId);
  }

  @Post('aliases/:id/disable')
  disableAlias(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.review.disableAlias(id, actor.userId);
  }

  @Get('skills/duplicates')
  duplicates() {
    return this.review.duplicates();
  }

  @Post('skills/merge')
  merge(@Body() dto: MergeSkillsDto, @CurrentUser() actor: AuthUser) {
    return this.review.mergeSkills(dto.sourceSkillId, dto.targetSkillId, dto.execute === true, actor.userId);
  }

  @Get('review-log')
  log(@Query('take') take?: string) {
    return this.review.log(take ? Number(take) : undefined);
  }
}
