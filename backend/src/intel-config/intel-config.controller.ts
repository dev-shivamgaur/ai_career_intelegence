import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../prisma/client';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { IntelConfigService } from './intel-config.service';

class SetIntelConfigDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  value!: Record<string, unknown>;
}

@ApiTags('admin-intel-config')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/intel-config')
export class IntelConfigController {
  constructor(private readonly config: IntelConfigService) {}

  @Get()
  list() {
    return this.config.list();
  }

  @Get(':key/history')
  history(@Param('key') key: string) {
    return this.config.history(key);
  }

  @Put(':key')
  set(@Param('key') key: string, @Body() dto: SetIntelConfigDto, @CurrentUser() actor: AuthUser) {
    return this.config.set(key, dto.value, actor.userId);
  }
}
