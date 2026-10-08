import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, SkillSource } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { search?: string; skip?: number; take?: number }) {
    const take = Math.min(Math.max(params.take ?? 25, 1), 100);
    const skip = Math.max(params.skip ?? 0, 0);
    const where: Prisma.UserWhereInput = params.search
      ? {
          OR: [
            { phone: { contains: params.search, mode: 'insensitive' } },
            { name: { contains: params.search, mode: 'insensitive' } },
            { email: { contains: params.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          phone: true,
          name: true,
          email: true,
          role: true,
          isDemo: true,
          onboardingComplete: true,
          createdAt: true,
          profile: { select: { completionPercent: true, careerTrack: true } },
          _count: { select: { documents: true, careerGoals: true, skillGaps: true } },
        },
      }),
    ]);

    return { total, skip, take, items: rows };
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        role: true,
        isDemo: true,
        onboardingComplete: true,
        createdAt: true,
        updatedAt: true,
        profile: {
          include: {
            education: true,
            userSkills: { include: { skill: true } },
            projects: true,
            certifications: true,
            experience: true,
          },
        },
        careerGoals: { include: { career: { select: { title: true, slug: true } } } },
        _count: { select: { documents: true, skillGaps: true, roadmaps: true, chatSessions: true } },
      },
    });
    if (!user) {
      throw new NotFoundException({ error: 'USER_NOT_FOUND', message: 'User not found' });
    }
    return user;
  }

  async knowledge(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        name: true,
        profile: {
          select: {
            primaryStack: true,
            userSkills: { include: { skill: { select: { id: true, name: true, category: true } } } },
          },
        },
        careerGoals: {
          where: { isActive: true },
          include: { career: { select: { id: true, title: true, slug: true } } },
          take: 1,
        },
        skillGaps: {
          include: { skill: { select: { id: true, name: true, category: true } } },
          orderBy: [{ priority: 'asc' }, { estimatedHours: 'desc' }],
        },
      },
    });
    if (!user) {
      throw new NotFoundException({ error: 'USER_NOT_FOUND', message: 'User not found' });
    }
    const goal = user.careerGoals[0] ?? null;
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      primaryStack: user.profile?.primaryStack ?? null,
      career: goal?.career ?? null,
      knownSkills: (user.profile?.userSkills ?? []).map((row) => ({
        skillId: row.skill.id,
        name: row.skill.name,
        category: row.skill.category,
        proficiency: row.proficiency,
      })),
      skillGaps: user.skillGaps.map((gap) => ({
        id: gap.id,
        skill: gap.skill.name,
        category: gap.skill.category,
        currentStatus: gap.currentStatus,
        priority: gap.priority,
        required: gap.required,
      })),
    };
  }

  async progress(id: string) {
    await this.get(id);
    const [goal, roadmap, gapCount] = await Promise.all([
      this.prisma.careerGoal.findFirst({
        where: { userId: id, isActive: true },
        include: { career: { select: { id: true, title: true, slug: true } } },
      }),
      this.prisma.roadmap.findFirst({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        include: { tasks: true, career: { select: { title: true } } },
      }),
      this.prisma.skillGap.count({ where: { userId: id } }),
    ]);
    const tasks = roadmap?.tasks ?? [];
    const count = (status: string) => tasks.filter((task) => task.status === status).length;
    return {
      career: goal
        ? {
            id: goal.career.id,
            title: goal.career.title,
            slug: goal.career.slug,
            estimatedMatch: goal.estimatedMatch,
            lastAnalyzedAt: goal.lastAnalyzedAt,
          }
        : null,
      skillGapCount: gapCount,
      roadmap: roadmap
        ? {
            id: roadmap.id,
            title: roadmap.title,
            careerTitle: roadmap.career.title,
            total: tasks.length,
            completed: count('COMPLETED'),
            inProgress: count('IN_PROGRESS'),
            notStarted: count('NOT_STARTED'),
            skipped: count('SKIPPED'),
          }
        : null,
    };
  }

  async updateProfile(
    id: string,
    dto: {
      name?: string;
      location?: string;
      primaryStack?: string;
      prepGoalText?: string;
      careerTrack?: 'PRIVATE_TECH' | 'GOVERNMENT_EXAM';
      educationLevel?: 'HIGH_SCHOOL' | 'INTERMEDIATE' | 'DIPLOMA' | 'UNDERGRADUATE' | 'POSTGRADUATE';
    },
  ) {
    const profile = await this.prisma.profile.findUnique({ where: { userId: id } });
    if (!profile) {
      throw new NotFoundException({ error: 'PROFILE_NOT_FOUND', message: 'This user has no profile yet' });
    }
    if (dto.name?.trim()) {
      await this.prisma.user.update({ where: { id }, data: { name: dto.name.trim() } });
    }
    await this.prisma.profile.update({
      where: { userId: id },
      data: {
        ...(dto.name?.trim() ? { name: dto.name.trim() } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.primaryStack !== undefined ? { primaryStack: dto.primaryStack.trim() || null } : {}),
        ...(dto.prepGoalText !== undefined ? { prepGoalText: dto.prepGoalText } : {}),
        ...(dto.careerTrack ? { careerTrack: dto.careerTrack } : {}),
        ...(dto.educationLevel ? { educationLevel: dto.educationLevel } : {}),
      },
    });
    return this.knowledge(id);
  }

  async addSkill(userId: string, name: string, category = 'General', proficiency = 40) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException({ error: 'PROFILE_NOT_FOUND', message: 'This user has no profile yet' });
    }
    const trimmed = name.trim().slice(0, 80);
    const skill = await this.prisma.skill.upsert({
      where: { name: trimmed },
      update: {},
      create: { name: trimmed, category: category.trim() || 'General' },
    });
    await this.prisma.userSkill.upsert({
      where: { profileId_skillId: { profileId: profile.id, skillId: skill.id } },
      update: { proficiency: Math.max(0, Math.min(100, proficiency)) },
      create: {
        profileId: profile.id,
        skillId: skill.id,
        proficiency: Math.max(0, Math.min(100, proficiency)),
        source: SkillSource.USER,
      },
    });
    return this.knowledge(userId);
  }

  async updateUserSkill(userId: string, skillId: string, proficiency: number) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException({ error: 'PROFILE_NOT_FOUND', message: 'This user has no profile yet' });
    }
    const row = await this.prisma.userSkill.findUnique({
      where: { profileId_skillId: { profileId: profile.id, skillId } },
    });
    if (!row) {
      throw new NotFoundException({ error: 'USER_SKILL_NOT_FOUND', message: 'Skill is not on this user' });
    }
    await this.prisma.userSkill.update({
      where: { id: row.id },
      data: { proficiency: Math.max(0, Math.min(100, proficiency)) },
    });
    return this.knowledge(userId);
  }

  async deleteUserSkill(userId: string, skillId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException({ error: 'PROFILE_NOT_FOUND', message: 'This user has no profile yet' });
    }
    await this.prisma.userSkill.deleteMany({ where: { profileId: profile.id, skillId } });
    return this.knowledge(userId);
  }

  async setRole(id: string, role: Role, actingUserId: string) {
    if (id === actingUserId && role !== Role.ADMIN) {
      throw new BadRequestException({
        error: 'CANNOT_DEMOTE_SELF',
        message: 'You cannot remove your own admin access',
      });
    }
    await this.get(id);
    return this.prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, phone: true, name: true, role: true },
    });
  }

  async remove(id: string, actingUserId: string) {
    if (id === actingUserId) {
      throw new BadRequestException({
        error: 'CANNOT_DELETE_SELF',
        message: 'You cannot delete the account you are signed in with',
      });
    }
    await this.get(id);
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true, id };
  }

  /**
   * Destructive bulk delete used for resetting an environment. Admins are kept
   * unless includeAdmins is set, so the caller never locks themselves out.
   */
  async removeAll(actingUserId: string, confirm: string, includeAdmins: boolean) {
    if (confirm !== 'DELETE_ALL_USERS') {
      throw new BadRequestException({
        error: 'CONFIRMATION_REQUIRED',
        message: 'Pass confirm=DELETE_ALL_USERS to run this operation',
      });
    }
    const where: Prisma.UserWhereInput = {
      id: { not: actingUserId },
      ...(includeAdmins ? {} : { role: Role.USER }),
    };
    const { count } = await this.prisma.user.deleteMany({ where });
    return { deleted: count };
  }

  async stats() {
    const [users, admins, profiles, goals, analysed, gaps, careers, skills, jobs, exams, opportunities, documents] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { role: Role.ADMIN } }),
        this.prisma.profile.count(),
        this.prisma.careerGoal.count({ where: { isActive: true } }),
        this.prisma.careerGoal.count({ where: { isActive: true, lastAnalyzedAt: { not: null } } }),
        this.prisma.skillGap.count(),
        this.prisma.career.count(),
        this.prisma.skill.count(),
        this.prisma.job.count(),
        this.prisma.governmentExam.count(),
        this.prisma.governmentOpportunity.count(),
        this.prisma.document.count(),
      ]);

    return {
      users: { total: users, admins, withProfile: profiles },
      goals: { active: goals, analysed, pendingAnalysis: goals - analysed, skillGapRows: gaps },
      catalog: { careers, skills, jobs, governmentExams: exams, governmentOpportunities: opportunities },
      documents,
    };
  }
}
