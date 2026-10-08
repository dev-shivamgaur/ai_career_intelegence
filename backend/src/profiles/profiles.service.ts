import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CareerTrack, DocumentType, EducationLevel, UserStatus } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SkillGapService } from '../skill-gap/skill-gap.service';
import { RoadmapCorpusService } from '../web/roadmap-corpus.service';
import { ProjectInputDto, UpdateProfileDto } from './dto/update-profile.dto';
import { EvidenceService } from '../ai/evidence.service';
import { tierPathCopy } from '../ai/learner-tier';
import { SkillMatchAgentService } from '../ai/skill-match-agent.service';

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly skillGaps: SkillGapService,
    private readonly corpus: RoadmapCorpusService,
    private readonly evidence: EvidenceService,
    private readonly matchAgent: SkillMatchAgentService,
  ) {}

  private readonly profileInclude = {
    education: true,
    userSkills: { include: { skill: true } },
    certifications: true,
    projects: true,
    experience: true,
  } as const;

  /**
   * Every user row must have exactly one profile row. Older accounts and accounts
   * created before the profile relation existed can be missing it, which used to
   * make every profile-backed page fail with PROFILE_NOT_FOUND.
   */
  private async ensureProfile(userId: string) {
    const existing = await this.prisma.profile.findUnique({
      where: { userId },
      include: this.profileInclude,
    });
    if (existing) return existing;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({ error: 'USER_NOT_FOUND', message: 'User not found' });
    }

    await this.prisma.profile.create({
      data: {
        userId,
        name: user.name ?? '',
        completionPercent: 15,
      },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingComplete: false },
    });

    return this.prisma.profile.findUniqueOrThrow({
      where: { userId },
      include: this.profileInclude,
    });
  }

  async getProfile(userId: string) {
    const profile = await this.ensureProfile(userId);

    const goal = await this.prisma.careerGoal.findFirst({
      where: { userId, isActive: true },
      include: { career: true },
    });

    const exam = profile.targetExamSlug
      ? await this.prisma.governmentExam.findUnique({ where: { slug: profile.targetExamSlug } })
      : null;

    const goalTitle =
      profile.prepGoalText ||
      exam?.shortName ||
      goal?.customTitle ||
      goal?.career.title ||
      'Not selected';

    const ev =
      profile.careerTrack === CareerTrack.GOVERNMENT_EXAM ? null : await this.evidence.forUser(userId);

    const completionPercent = await this.computeCompletion(userId, profile, Boolean(goal || exam));

    return {
      id: profile.id,
      userId: profile.userId,
      name: profile.name,
      status: profile.status,
      educationLevel: profile.educationLevel,
      location: profile.location,
      availableHoursPerDay: profile.availableHoursPerDay,
      learningStyle: profile.learningStyle,
      remotePreference: profile.remotePreference,
      careerTrack: profile.careerTrack,
      prepGoalText: profile.prepGoalText,
      targetExamSlug: profile.targetExamSlug,
      targetExamName: exam?.name ?? null,
      primaryStack: profile.primaryStack,
      profileStage: this.profileStage(profile.status, profile.educationLevel, profile.careerTrack),
      completionPercent,
      education: profile.education,
      skills: profile.userSkills.map((us) => ({
        id: us.id,
        skillId: us.skillId,
        name: us.skill.name,
        category: us.skill.category,
        proficiency: us.proficiency,
        source: us.source,
        status: us.status,
      })),
      certifications: profile.certifications,
      projects: profile.careerTrack === CareerTrack.GOVERNMENT_EXAM ? [] : profile.projects,
      experience: profile.experience,
      careerGoal: {
        id: goal?.id ?? '',
        title: goalTitle,
        slug: exam?.slug ?? goal?.career.slug ?? '',
        custom: Boolean(profile.prepGoalText || goal?.customTitle),
      },
      evidence: ev
        ? {
            stack: ev.stack,
            stackLabel: ev.stackLabel,
            confidence: ev.confidence,
            stackOptions: ev.stackOptions,
            seniority: ev.seniority,
            learnerTier: ev.learnerTier,
            roleSkillMatchPercent: ev.roleSkillMatchPercent,
            roleSkillMatched: ev.roleSkillMatched,
            roleSkillTotal: ev.roleSkillTotal,
            ...tierPathCopy(ev.learnerTier),
            suggestedStatus: ev.suggestedStatus,
            needsStackConfirm: !ev.stack || ev.confidence < 0.35,
          }
        : {
            stack: null,
            stackLabel: null,
            confidence: 0,
            stackOptions: [],
            seniority: 'none' as const,
            learnerTier: 'early' as const,
            roleSkillMatchPercent: 0,
            roleSkillMatched: 0,
            roleSkillTotal: 0,
            pathLabel: 'Getting started',
            pathDetail: 'Complete onboarding and pick a target role.',
            suggestedStatus: null,
            needsStackConfirm: false,
          },
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const existing = await this.ensureProfile(userId);

    const {
      careerSlug,
      customGoalTitle,
      skills,
      projects,
      degree,
      institution,
      specialization,
      graduationYear,
      education,
      ...rest
    } = dto;

    await this.prisma.profile.update({
      where: { userId },
      data: rest,
    });

    if (dto.name) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          name: dto.name,
          avatarInitials: dto.name
            .split(/\s+/)
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase(),
        },
      });
    }

    const educationRows = (education ?? []).filter((row) => row.degree?.trim());
    if (educationRows.length) {
      for (const row of educationRows) {
        const level = row.level ?? dto.educationLevel ?? existing.educationLevel;
        const school =
          level === EducationLevel.HIGH_SCHOOL || level === EducationLevel.INTERMEDIATE;
        const existingRow = school
          ? await this.prisma.education.findFirst({ where: { profileId: existing.id, level } })
          : row.id && !row.id.startsWith('edu-')
            ? await this.prisma.education.findFirst({ where: { id: row.id, profileId: existing.id } })
            : await this.prisma.education.findFirst({
                where: { profileId: existing.id, degree: row.degree.trim() },
              });
        const data = {
          degree: row.degree.trim(),
          institution: row.institution?.trim() || existingRow?.institution || '',
          specialization: row.specialization ?? existingRow?.specialization ?? null,
          graduationYear: row.graduationYear ?? existingRow?.graduationYear ?? null,
          level,
        };
        if (existingRow) {
          await this.prisma.education.update({ where: { id: existingRow.id }, data });
        } else {
          await this.prisma.education.create({ data: { profileId: existing.id, ...data } });
        }
      }
    } else if (degree || institution) {
      const level = dto.educationLevel ?? existing.educationLevel;
      const existingRow = await this.prisma.education.findFirst({
        where: {
          profileId: existing.id,
          OR: [{ degree: degree || 'Not specified' }, { level }],
        },
      });
      const data = {
        degree: degree || 'Not specified',
        institution: institution || 'Not specified',
        specialization: specialization ?? null,
        graduationYear: graduationYear ?? null,
        level,
      };
      if (existingRow) {
        await this.prisma.education.update({ where: { id: existingRow.id }, data });
      } else {
        await this.prisma.education.create({ data: { profileId: existing.id, ...data } });
      }
    }

    if (skills?.length) {
      await this.prisma.userSkill.deleteMany({ where: { profileId: existing.id } });
      for (const name of skills.map((s) => s.trim()).filter(Boolean)) {
        const skill = await this.prisma.skill.upsert({
          where: { name },
          update: {},
          create: { name, category: 'General' },
        });
        await this.prisma.userSkill.create({
          data: { profileId: existing.id, skillId: skill.id, proficiency: 50, source: 'USER' },
        });
      }
    }

    if (projects) {
      await this.replaceProjects(existing.id, projects);
    }

    const track = dto.careerTrack ?? existing.careerTrack;
    const isGov = track === CareerTrack.GOVERNMENT_EXAM;

    let goalChanged = false;
    if (!isGov) {
      if (careerSlug) {
        const prev = await this.prisma.careerGoal.findFirst({
          where: { userId, isActive: true },
          include: { career: true },
        });
        if (prev && prev.career.slug !== careerSlug) {
          await this.prisma.profile.update({
            where: { userId },
            data: { primaryStack: null },
          });
        }
        goalChanged = true;
        await this.setCareerGoal(userId, careerSlug, customGoalTitle || dto.prepGoalText);
      } else if (customGoalTitle || dto.prepGoalText) {
        goalChanged = true;
        await this.setCustomGoal(userId, customGoalTitle || dto.prepGoalText || 'Custom goal');
      }
    }

    if (dto.targetExamSlug) {
      await this.attachExamPlan(userId, dto.targetExamSlug);
    }

    // Private syllabus fetch (roadmap.sh) can exceed the browser's 60s axios timeout.
    // Never await it on this request. Sarkari users skip the tech gap plan entirely.
    if (!isGov && (goalChanged || skills?.length || projects || dto.primaryStack)) {
      if (careerSlug) {
        this.queueCareerPrep(userId, careerSlug);
      } else {
        void this.skillGaps.safeRecalculate(userId).catch((err: Error) => {
          this.logger.warn(`Gap refresh failed for ${userId}: ${err.message}`);
        });
        void this.corpus.ensureUserRoadmap(userId).catch((err: Error) => {
          this.logger.warn(`Roadmap ensure failed for ${userId}: ${err.message}`);
        });
      }
    }

    return this.getProfile(userId);
  }

  async listProjects(userId: string) {
    const profile = await this.ensureProfile(userId);
    return this.prisma.project.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addProject(userId: string, dto: ProjectInputDto) {
    const profile = await this.ensureProfile(userId);
    const created = await this.prisma.project.create({
      data: {
        profileId: profile.id,
        name: dto.name,
        description: dto.description ?? '',
        skills: dto.skills ?? [],
        year: dto.year ?? null,
        link: dto.link ?? null,
      },
    });
    await this.skillGaps.safeRecalculate(userId);
    return created;
  }

  async updateProject(userId: string, projectId: string, dto: ProjectInputDto) {
    const profile = await this.ensureProfile(userId);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, profileId: profile.id },
    });
    if (!project) {
      throw new NotFoundException({ error: 'PROJECT_NOT_FOUND', message: 'Project not found' });
    }
    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        name: dto.name,
        description: dto.description ?? '',
        skills: dto.skills ?? [],
        year: dto.year ?? null,
        link: dto.link ?? null,
      },
    });
  }

  async deleteProject(userId: string, projectId: string) {
    const profile = await this.ensureProfile(userId);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, profileId: profile.id },
    });
    if (!project) {
      throw new NotFoundException({ error: 'PROJECT_NOT_FOUND', message: 'Project not found' });
    }
    await this.prisma.project.delete({ where: { id: projectId } });
    return { deleted: true, id: projectId };
  }

  private async replaceProjects(profileId: string, projects: ProjectInputDto[]) {
    await this.prisma.project.deleteMany({ where: { profileId } });
    if (!projects.length) return;
    await this.prisma.project.createMany({
      data: projects
        .filter((p) => p.name?.trim())
        .map((p) => ({
          profileId,
          name: p.name.trim(),
          description: p.description ?? '',
          skills: p.skills ?? [],
          year: p.year ?? null,
          link: p.link ?? null,
        })),
    });
  }

  async completeOnboarding(userId: string, dto: UpdateProfileDto) {
    const profile = await this.updateProfile(userId, { ...dto, completionPercent: dto.completionPercent ?? 80 });
    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingComplete: true },
    });
    return profile;
  }

  /** Roadmap.sh fetch plus Qdrant embeddings. Must not block the HTTP response. */
  private queueCareerPrep(userId: string, careerSlug: string) {
    void this.prepareCareer(userId, careerSlug).catch((err: Error) => {
      this.logger.warn(`Career prep failed for ${userId}: ${err.message}`);
    });
  }

  private async prepareCareer(userId: string, careerSlug: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (profile?.careerTrack === CareerTrack.GOVERNMENT_EXAM) return;
    await this.corpus.syncCareer(careerSlug);
    await this.evidence.persistDetectedStack(userId);
    await this.matchAgent.matchAndSuggest(userId).catch((err: Error) => {
      this.logger.warn(`Skill match skip: ${err.message}`);
    });
    await this.skillGaps.safeRecalculate(userId);
    await this.corpus.ensureUserRoadmap(userId);
  }

  private async computeCompletion(
    userId: string,
    profile: {
      name: string;
      location: string | null;
      primaryStack: string | null;
      education: unknown[];
      userSkills: unknown[];
      projects: unknown[];
      experience: unknown[];
      careerTrack: CareerTrack;
    },
    hasGoal: boolean,
  ) {
    const resume = await this.prisma.document.count({
      where: { userId, type: DocumentType.RESUME },
    });
    let score = 8;
    if (profile.name?.trim()) score += 8;
    if (hasGoal) score += 14;
    if (profile.education.length) score += 12;
    if (profile.userSkills.length) score += 12;
    if (profile.careerTrack !== CareerTrack.GOVERNMENT_EXAM && profile.projects.length) score += 14;
    if (profile.experience.length) score += 10;
    if (resume) score += 12;
    if (profile.location) score += 5;
    if (profile.primaryStack) score += 5;
    return Math.min(100, score);
  }

  private profileStage(status: UserStatus, educationLevel: EducationLevel, track: CareerTrack) {
    const gov = track === CareerTrack.GOVERNMENT_EXAM;
    if (status === UserStatus.WORKING_PROFESSIONAL) {
      return {
        label: 'Working professional',
        detail: gov
          ? 'You already work and are adding sarkari exam preparation on top of a job.'
          : 'You have work experience. We will compare it with the private-sector role you chose.',
      };
    }
    if (
      educationLevel === EducationLevel.HIGH_SCHOOL ||
      educationLevel === EducationLevel.INTERMEDIATE ||
      educationLevel === EducationLevel.DIPLOMA
    ) {
      return {
        label:
          educationLevel === EducationLevel.DIPLOMA
            ? 'Diploma student / holder'
            : educationLevel === EducationLevel.INTERMEDIATE
              ? 'Class 12 / Intermediate'
              : 'Class 10 / High school',
        detail: gov
          ? 'Many notices need graduation. We will flag eligibility gaps against the exam you pick.'
          : 'Entry roles and internships come first. Build a small portfolio of skills, not a long project list.',
      };
    }
    if (educationLevel === EducationLevel.UNDERGRADUATE && status === UserStatus.STUDENT) {
      return {
        label: 'Undergraduate student',
        detail: gov
          ? 'You can start syllabus now. Apply only when the notice matches your passing year.'
          : 'You are still in college. Internships and one solid project matter more than job titles.',
      };
    }
    if (educationLevel === EducationLevel.UNDERGRADUATE && status === UserStatus.FRESHER) {
      return {
        label: 'Graduate / fresher',
        detail: gov
          ? 'You meet the typical graduate bar. Next: pick the exam and close syllabus gaps.'
          : 'You are a fresher graduate. We will match skills to junior private-sector roles.',
      };
    }
    if (educationLevel === EducationLevel.POSTGRADUATE) {
      return {
        label: 'Postgraduate',
        detail: gov
          ? 'Postgraduate eligibility is usually fine. Focus on the optional paper / mains writing.'
          : 'Postgraduate background can support specialist private roles. We will still check skill gaps.',
      };
    }
    return {
      label: 'Getting started',
      detail: 'Complete onboarding so we can place you on a private or sarkari path.',
    };
  }

  private async setCareerGoal(userId: string, careerIdOrSlug: string, customTitle?: string) {
    const career = await this.prisma.career.findFirst({
      where: { OR: [{ id: careerIdOrSlug }, { slug: careerIdOrSlug }] },
    });
    if (!career) return;
    await this.prisma.careerGoal.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    const existing = await this.prisma.careerGoal.findFirst({
      where: { userId, careerId: career.id },
    });
    if (existing) {
      await this.prisma.careerGoal.update({
        where: { id: existing.id },
        data: { isActive: true, customTitle: customTitle ?? existing.customTitle },
      });
      return;
    }
    await this.prisma.careerGoal.create({
      data: { userId, careerId: career.id, isActive: true, customTitle },
    });
  }

  private async setCustomGoal(userId: string, title: string) {
    const slug = this.slugifyField(title);
    let career = await this.prisma.career.findFirst({
      where: { OR: [{ slug }, { title: { equals: title, mode: 'insensitive' } }] },
    });
    if (!career) {
      career = await this.prisma.career.create({
        data: {
          title: title.slice(0, 80),
          slug,
          overview: `${title} — field saved from the learner’s own description.`,
          marketExpectations: 'Built from what you typed plus your skills and resume.',
          entryLevelExpectations: 'We will ask your main stack if we cannot detect it.',
          isCustom: true,
          coreTopics: [],
          stackLanes: [],
        },
      });
    }
    await this.setCareerGoal(userId, career.slug, title);
  }

  private slugifyField(title: string) {
    const base =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48) || 'custom-field';
    return `field-${base}`;
  }

  private async attachExamPlan(userId: string, slug: string) {
    const exam = await this.prisma.governmentExam.findUnique({ where: { slug } });
    if (!exam) return;
    await this.prisma.governmentExamPlan.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    await this.prisma.governmentExamPlan.upsert({
      where: { userId_examId: { userId, examId: exam.id } },
      update: { isActive: true },
      create: { userId, examId: exam.id, isActive: true, dailyMinutes: 120 },
    });
  }
}
