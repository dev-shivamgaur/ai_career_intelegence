import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ResearchService } from './research.service';
import { CreateResearchDto } from './dto/research.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('research')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('research')
export class ResearchController {
  constructor(private readonly research: ResearchService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateResearchDto) {
    return this.research.create(user.userId, dto);
  }

  @Get()
  latest(@CurrentUser() user: AuthUser) {
    return this.research.latest(user.userId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.research.get(user.userId, id);
  }

  @Get(':id/sources')
  sources(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.research.sources(user.userId, id);
  }
}
