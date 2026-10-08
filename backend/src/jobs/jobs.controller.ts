import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list() {
    return this.jobs.list();
  }

  @Get('matches')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  matches(@CurrentUser() user: AuthUser) {
    return this.jobs.matches(user.userId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.jobs.get(id);
  }
}
