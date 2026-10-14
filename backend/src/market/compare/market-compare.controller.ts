import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { Role } from '../../prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { marketFlags } from '../market.flags';
import { MarketDemandService } from '../demand/market-demand.service';
import { MarketTrendService } from '../trend/market-trend.service';
import { MarketCompareService } from './market-compare.service';

export class PromoteSkillDto {
  @IsString()
  skillId!: string;
}

function uiOff() {
  throw new NotFoundException({ error: 'MARKET_UI_DISABLED', message: 'Market insights are not enabled' });
}

@ApiTags('market')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('market/careers')
export class MarketLearnerController {
  constructor(
    private readonly compare: MarketCompareService,
    private readonly demand: MarketDemandService,
    private readonly trends: MarketTrendService,
  ) {}

  @Get(':slug/demand')
  demandView(@Param('slug') slug: string, @Query('lane') lane?: string, @Query('period') period?: string, @Query('basis') basis?: string) {
    if (!marketFlags.ui()) uiOff();
    return this.bySlug(slug, (id) => this.demand.careerDemand(id, { lane, periodType: period, basis }));
  }

  @Get(':slug/trends')
  trendsView(@Param('slug') slug: string, @Query('lane') lane?: string, @Query('period') period?: string) {
    if (!marketFlags.ui()) uiOff();
    return this.bySlug(slug, (id) => this.trends.list(id, { lane, periodType: period }));
  }

  @Get(':slug/roadmap-vs-market')
  roadmap(@Param('slug') slug: string, @Query('lane') lane?: string) {
    if (!marketFlags.ui()) uiOff();
    return this.compare.compareBySlug(slug, lane);
  }

  private async bySlug<T>(slug: string, load: (careerId: string) => Promise<T>) {
    const view = await this.compare.compareBySlug(slug, 'all');
    return load(view.career.id);
  }
}

@ApiTags('admin-market')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/market')
export class MarketCompareAdminController {
  constructor(private readonly compare: MarketCompareService) {}

  @Get('careers/:careerId/roadmap-vs-market')
  view(@Param('careerId') careerId: string, @Query('lane') lane?: string) {
    return this.compare.compare(careerId, lane);
  }

  @Post('careers/:careerId/promote')
  promote(@Param('careerId') careerId: string, @Body() dto: PromoteSkillDto, @CurrentUser() actor: AuthUser) {
    return this.compare.promote(careerId, dto.skillId, actor.userId);
  }
}
