import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '../../prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MarketSourcesService } from './market-sources.service';
import {
  CreateCompanyDto,
  CreateMarketSourceDto,
  RecordTermsReviewDto,
  UpdateCompanyDto,
  UpdateMarketSourceDto,
} from './dto/market-sources.dto';

@ApiTags('admin-market')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/market')
export class MarketSourcesController {
  constructor(private readonly sources: MarketSourcesService) {}

  @Get('companies')
  listCompanies() {
    return this.sources.listCompanies();
  }

  @Post('companies')
  createCompany(@Body() dto: CreateCompanyDto) {
    return this.sources.createCompany(dto);
  }

  @Patch('companies/:id')
  updateCompany(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.sources.updateCompany(id, dto);
  }

  @Get('sources')
  listSources() {
    return this.sources.listSources();
  }

  @Post('sources')
  createSource(@Body() dto: CreateMarketSourceDto) {
    return this.sources.createSource(dto);
  }

  @Patch('sources/:id')
  updateSource(@Param('id') id: string, @Body() dto: UpdateMarketSourceDto) {
    return this.sources.updateSource(id, dto);
  }

  @Post('sources/:id/terms-review')
  recordTermsReview(@Param('id') id: string, @Body() dto: RecordTermsReviewDto, @CurrentUser() actor: AuthUser) {
    return this.sources.recordTermsReview(id, dto, actor.userId);
  }

  @Post('sources/:id/enable')
  enable(@Param('id') id: string) {
    return this.sources.enable(id);
  }

  @Post('sources/:id/disable')
  disable(@Param('id') id: string) {
    return this.sources.disable(id);
  }

  @Post('sources/:id/test-fetch')
  testFetch(@Param('id') id: string) {
    return this.sources.testFetch(id);
  }
}
