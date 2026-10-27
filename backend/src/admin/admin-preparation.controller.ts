import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { Role, PrepPackageStatus } from '../prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminPreparationService } from './admin-preparation.service';

class CreateDraftDto {
  @IsString()
  skillId!: string;

  @IsOptional()
  @IsBoolean()
  conceptual?: boolean;
}

class UpdateDraftDto {
  @IsObject()
  content!: Record<string, unknown>;

  @IsObject()
  rubric!: Record<string, unknown>;
}

@ApiTags('admin-preparation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/preparation')
export class AdminPreparationController {
  constructor(private readonly admin: AdminPreparationService) {}

  @Get('packages')
  list(
    @Query('skillId') skillId?: string,
    @Query('status') status?: PrepPackageStatus,
  ) {
    return this.admin.list(skillId, status);
  }

  @Get('packages/:id')
  get(@Param('id') id: string) {
    return this.admin.get(id);
  }

  @Post('packages')
  create(@Body() dto: CreateDraftDto) {
    return this.admin.createDraft(dto.skillId, dto.conceptual);
  }

  @Put('packages/:id')
  update(@Param('id') id: string, @Body() dto: UpdateDraftDto) {
    return this.admin.updateDraft(id, dto);
  }

  @Post('packages/:id/validate')
  validate(@Param('id') id: string) {
    return this.admin.validate(id);
  }

  @Post('packages/:id/publish')
  publish(@Param('id') id: string) {
    return this.admin.publish(id);
  }

  @Post('packages/:id/generate')
  generate(@Param('id') id: string) {
    return this.admin.generateDraft(id);
  }

  @Get('packages/:id/preview')
  preview(@Param('id') id: string) {
    return this.admin.preview(id);
  }
}
