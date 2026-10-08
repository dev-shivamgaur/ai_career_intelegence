import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const jobs = await this.prisma.job.findMany({
      where: { isDemo: false },
      include: { skills: { include: { skill: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return jobs.map((j) => this.mapJob(j));
  }

  async get(id: string) {
    const job = await this.prisma.job.findFirst({
      where: { id, isDemo: false },
      include: { skills: { include: { skill: true } } },
    });
    if (!job) {
      throw new NotFoundException({ error: 'JOB_NOT_FOUND', message: 'Job not found' });
    }
    return this.mapJob(job);
  }
 
  async matches(userId: string) {
    const matches = await this.prisma.jobMatch.findMany({
      where: { userId, job: { isDemo: false } },
      include: {
        job: { include: { skills: { include: { skill: true } } } },
      },
      orderBy: { matchPercent: 'desc' },
    });
    return matches.map((m) => ({
      ...this.mapJob(m.job),
      matchPercent: m.matchPercent,
      matchLabel: m.matchLabel,
      whyMatches: m.whyMatches ?? m.job.whyMatches,
    }));
  }

  private mapJob(job: {
    id: string;
    company: string;
    role: string;
    location: string | null;
    workType: string;
    experience: string | null;
    description: string | null;
    whyMatches: string | null;
    priority: string;
    isDemo: boolean;
    skills: Array<{ isMissing: boolean; skill: { name: string } }>;
  }) {
    return {
      id: job.id,
      company: job.company,
      role: job.role,
      location: job.location,
      workType: job.workType,
      experience: job.experience,
      description: job.description,
      whyMatches: job.whyMatches,
      priority: job.priority,
      isDemo: job.isDemo,
      matchedSkills: job.skills.filter((s) => !s.isMissing).map((s) => s.skill.name),
      missingSkills: job.skills.filter((s) => s.isMissing).map((s) => s.skill.name),
    };
  }
}
