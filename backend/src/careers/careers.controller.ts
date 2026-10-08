import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CareersService } from './careers.service';
import { CreateCareerGoalDto, UpdateCareerGoalDto } from './dto/career.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('careers')
@Controller()
export class CareersController {
  constructor(private readonly careers: CareersService) {}

  @Get('careers')
  list() {
    return this.careers.listCareers();
  }

  @Get('careers/:id')
  get(@Param('id') id: string) {
    return this.careers.getCareer(id);
  }

  @Post('career-goals')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  createGoal(@CurrentUser() user: AuthUser, @Body() dto: CreateCareerGoalDto) {
    return this.careers.createGoal(user.userId, dto);
  }

  @Patch('career-goals/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  updateGoal(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCareerGoalDto,
  ) {
    return this.careers.updateGoal(user.userId, id, dto);
  }

  @Get('career-analysis')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  analysis(@CurrentUser() user: AuthUser) {
    return this.careers.getAnalysis(user.userId);
  }

  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  dashboard(@CurrentUser() user: AuthUser) {
    return this.careers.dashboard(user.userId);
  }

  @Post('career-analysis/run')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  run(@CurrentUser() user: AuthUser) {
    return this.careers.runAnalysis(user.userId);
  }
}
