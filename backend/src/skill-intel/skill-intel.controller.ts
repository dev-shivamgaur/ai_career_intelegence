import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role, SkillAliasStatus } from '../prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SkillIntelService } from './skill-intel.service';
import { SkillResolverService } from './skill-resolver.service';
import {
  CreateSkillAliasDto,
  CreateSkillDomainDto,
  SetSkillDomainDto,
  UpdateSkillAliasDto,
  UpdateSkillDomainDto,
} from './dto/skill-intel.dto';

@ApiTags('admin-skill-intel')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/skill-intel')
export class SkillIntelController {
  constructor(
    private readonly intel: SkillIntelService,
    private readonly resolver: SkillResolverService,
  ) {}

  @Get('domains')
  listDomains() {
    return this.intel.listDomains();
  }

  @Post('domains')
  createDomain(@Body() dto: CreateSkillDomainDto) {
    return this.intel.createDomain(dto);
  }

  @Patch('domains/:key')
  updateDomain(@Param('key') key: string, @Body() dto: UpdateSkillDomainDto) {
    return this.intel.updateDomain(key, dto);
  }

  @Patch('skills/:id/domain')
  setSkillDomain(@Param('id') id: string, @Body() dto: SetSkillDomainDto) {
    return this.intel.setSkillDomain(id, dto.domainKey);
  }

  @Get('aliases')
  @ApiQuery({ name: 'skillId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: SkillAliasStatus })
  listAliases(@Query('skillId') skillId?: string, @Query('status') status?: SkillAliasStatus) {
    return this.intel.listAliases(skillId, status);
  }

  @Post('aliases')
  createAlias(@Body() dto: CreateSkillAliasDto) {
    return this.intel.createAlias(dto);
  }

  @Patch('aliases/:id')
  updateAlias(@Param('id') id: string, @Body() dto: UpdateSkillAliasDto) {
    return this.intel.updateAlias(id, dto.status);
  }

  @Delete('aliases/:id')
  deleteAlias(@Param('id') id: string) {
    return this.intel.deleteAlias(id);
  }

  @Get('resolve')
  @ApiQuery({ name: 'name', required: true })
  resolve(@Query('name') name: string) {
    return this.resolver.resolve(name ?? '');
  }

  @Get('resolver/stats')
  resolverStats() {
    return this.resolver.stats();
  }

  @Get('reports/duplicates')
  duplicates() {
    return this.intel.duplicateReport();
  }

  @Get('reports/provenance')
  provenance() {
    return this.intel.provenanceSummary();
  }
}
