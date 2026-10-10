import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString } from 'class-validator';
import { Role } from '../../prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MarketDemandService } from './market-demand.service';

export class AggregateDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  careerIds?: string[];
}

@ApiTags('admin-market')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/market')
export class MarketDemandController {
  constructor(private readonly demand: MarketDemandService) {}

  /** Recomputes demand snapshots (and trends) for every enabled career, or the given ones. */
  @Post('runs/aggregate')
  aggregate(@Body() dto: AggregateDto) {
    return this.demand.startAggregateRun('ADMIN', undefined, dto.careerIds);
  }

  @Get('demand/careers/:careerId')
  careerDemand(
    @Param('careerId') careerId: string,
    @Query('periodType') periodType?: string,
    @Query('basis') basis?: string,
    @Query('lane') lane?: string,
    @Query('periodStart') periodStart?: string,
    @Query('take') take?: string,
  ) {
    return this.demand.careerDemand(careerId, { periodType, basis, lane, periodStart, take: take ? Number(take) : undefined });
  }

  @Get('demand/careers/:careerId/periods')
  periods(@Param('careerId') careerId: string, @Query('periodType') periodType?: string, @Query('basis') basis?: string, @Query('lane') lane?: string) {
    return this.demand.periods(careerId, { periodType, basis, lane });
  }

  @Get('demand/careers/:careerId/current')
  current(@Param('careerId') careerId: string, @Query('lane') lane?: string, @Query('take') take?: string) {
    return this.demand.currentDemand(careerId, { lane, take: take ? Number(take) : undefined });
  }

  @Get('demand/panel')
  panel(@Query('periodType') periodType?: string, @Query('periodStart') periodStart?: string) {
    return this.demand.panel(periodType, periodStart);
  }
}
