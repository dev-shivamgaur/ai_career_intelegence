import { Controller, Get, Patch, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProfilesService } from './profiles.service';
import { CompleteOnboardingDto, ProjectInputDto, UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.profiles.getProfile(user.userId);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profiles.updateProfile(user.userId, dto);
  }

  @Post('complete-onboarding')
  complete(@CurrentUser() user: AuthUser, @Body() dto: CompleteOnboardingDto) {
    return this.profiles.completeOnboarding(user.userId, dto);
  }

  @Get('projects')
  listProjects(@CurrentUser() user: AuthUser) {
    return this.profiles.listProjects(user.userId);
  }

  @Post('projects')
  addProject(@CurrentUser() user: AuthUser, @Body() dto: ProjectInputDto) {
    return this.profiles.addProject(user.userId, dto);
  }

  @Patch('projects/:id')
  updateProject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ProjectInputDto,
  ) {
    return this.profiles.updateProject(user.userId, id, dto);
  }

  @Delete('projects/:id')
  deleteProject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.profiles.deleteProject(user.userId, id);
  }
}
