import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoadmapService } from './roadmap.service';
import { CheckRoadmapTaskDto, UpdateRoadmapTaskDto } from './dto/roadmap.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('roadmap')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('roadmap')
export class RoadmapController {
  constructor(private readonly roadmap: RoadmapService) {}

  @Get()
  get(@CurrentUser() user: AuthUser, @Query('phase') phase?: string) {
    return this.roadmap.get(user.userId, phase);
  }

  @Post('generate')
  generate(@CurrentUser() user: AuthUser) {
    return this.roadmap.generate(user.userId);
  }

  @Post('tasks/:id/check')
  checkTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CheckRoadmapTaskDto,
    @Query('phase') phase?: string,
  ) {
    return this.roadmap.checkTask(user.userId, id, dto.answer ?? '', phase);
  }

  @Patch('tasks/:id')
  updateTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoadmapTaskDto,
  ) {
    return this.roadmap.updateTask(user.userId, id, dto);
  }
}
