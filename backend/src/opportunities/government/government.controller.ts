import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GovernmentService } from './government.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@ApiTags('government')
@Controller('government-opportunities')
export class GovernmentController {
  constructor(private readonly government: GovernmentService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  list(@CurrentUser() user: AuthUser) {
    return this.government.list(user.userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.government.get(id, user.userId);
  }
}
