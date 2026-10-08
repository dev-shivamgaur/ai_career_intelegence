import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '../prisma/client';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminUsersService } from './admin-users.service';
import { AdminProfileDto, AdminUserSkillDto, AdminUserSkillPatchDto, UpdateUserRoleDto } from './dto/admin-catalog.dto';

@ApiTags('admin-users')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get('stats')
  stats() {
    return this.users.stats();
  }

  @Get('users')
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'skip', required: false })
  @ApiQuery({ name: 'take', required: false })
  list(
    @Query('search') search?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.users.list({
      search,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Get('users/:id')
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Get('users/:id/knowledge')
  knowledge(@Param('id') id: string) {
    return this.users.knowledge(id);
  }

  @Get('users/:id/progress')
  progress(@Param('id') id: string) {
    return this.users.progress(id);
  }

  @Patch('users/:id/profile')
  updateProfile(@Param('id') id: string, @Body() dto: AdminProfileDto) {
    return this.users.updateProfile(id, dto);
  }

  @Post('users/:id/skills')
  addSkill(@Param('id') id: string, @Body() dto: AdminUserSkillDto) {
    return this.users.addSkill(id, dto.name, dto.category, dto.proficiency ?? 40);
  }

  @Patch('users/:id/skills/:skillId')
  updateUserSkill(@Param('id') id: string, @Param('skillId') skillId: string, @Body() dto: AdminUserSkillPatchDto) {
    return this.users.updateUserSkill(id, skillId, dto.proficiency ?? 40);
  }

  @Delete('users/:id/skills/:skillId')
  deleteUserSkill(@Param('id') id: string, @Param('skillId') skillId: string) {
    return this.users.deleteUserSkill(id, skillId);
  }

  @Patch('users/:id/role')
  setRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto, @CurrentUser() actor: AuthUser) {
    return this.users.setRole(id, dto.role, actor.userId);
  }

  @Delete('users/:id')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.users.remove(id, actor.userId);
  }

  @Delete('users')
  @ApiQuery({ name: 'confirm', required: true, description: 'Must be DELETE_ALL_USERS' })
  @ApiQuery({ name: 'includeAdmins', required: false })
  removeAll(
    @CurrentUser() actor: AuthUser,
    @Query('confirm') confirm: string,
    @Query('includeAdmins') includeAdmins?: string,
  ) {
    return this.users.removeAll(actor.userId, confirm, includeAdmins === 'true');
  }
}
