import { Injectable } from '@nestjs/common';
import { CareerTrack } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceService } from './evidence.service';
import { SarkariJudgeService } from '../sarkari/sarkari-judge.service';
import { SarkariRagService } from '../sarkari/sarkari-rag.service';
import { belongsToOtherLane } from './stack-lanes';

@Injectable()
export class CareerToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly sarkariJudge: SarkariJudgeService,
    private readonly sarkariRag: SarkariRagService,
  ) {}

  async getMyProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: {
        education: true,
        userSkills: { include: { skill: true } },
        certifications: true,
        projects: true,
        experience: true,
      },
    });
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, phone: true, onboardingComplete: true },
    });
    return JSON.stringify({
      user,
      profile: profile
        ? {
            name: profile.name,
            status: profile.status,
            educationLevel: profile.educationLevel,
            location: profile.location,
            careerTrack: profile.careerTrack,
            prepGoalText: profile.prepGoalText,
            targetExamSlug: profile.targetExamSlug,
            primaryStack: profile.primaryStack,
            availableHoursPerDay: profile.availableHoursPerDay,
            skills: profile.userSkills.map((s) => ({
              name: s.skill.name,
              proficiency: s.proficiency,
              status: s.status,
            })),
            education: profile.education,
            projects: profile.projects,
            experience: profile.experience,
            certifications: profile.certifications,
          }
        : null,
    });
  }

  async getCareerGoal(userId: string) {
    try {
      const profile = await this.prisma.profile.findUnique({ where: { userId } });
      if (profile?.careerTrack === CareerTrack.GOVERNMENT_EXAM) {
        return this.listGovernmentExams(userId);
      }
      const goal = await this.prisma.careerGoal.findFirst({
        where: { userId, isActive: true },
        include: {
          career: { include: { requirements: { include: { skill: true } } } },
        },
      });
      const ev = goal ? await this.evidence.forUser(userId) : null;
      return JSON.stringify(
        goal
          ? {
              title: goal.customTitle ?? goal.career.title,
              slug: goal.career.slug,
              overview: goal.career.overview,
              marketExpectations: goal.career.marketExpectations,
              entryLevelExpectations: goal.career.entryLevelExpectations,
              estimatedMatch: goal.estimatedMatch,
              lastAnalyzedAt: goal.lastAnalyzedAt,
              stack: ev?.stackLabel,
              seniority: ev?.seniority,
              requirements: goal.career.requirements
                .filter((r) => {
                  if (r.layer === 'ALTERNATIVE' || r.layer === 'OPTIONAL') return false;
                  if (ev && belongsToOtherLane(r.skill.name, ev.family, ev.stack)) return false;
                  if (r.stackLane && ev?.stack && r.stackLane !== ev.stack) return false;
                  return true;
                })
                .map((r) => ({
                  skill: r.skill.name,
                  importance: r.importance,
                  type: r.type,
                  layer: r.layer,
                })),
            }
          : { error: 'No active career goal' },
      );
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  async getSkillGaps(userId: string) {
    const gaps = await this.prisma.skillGap.findMany({
      where: { userId },
      include: { skill: true },
      orderBy: { priority: 'asc' },
    });
    return JSON.stringify(
      gaps.map((g) => ({
        skill: g.skill.name,
        currentStatus: g.currentStatus,
        required: g.required,
        priority: g.priority,
        estimatedHours: g.estimatedHours,
        why: g.why,
      })),
    );
  }

  async getRoadmap(userId: string) {
    const roadmap = await this.prisma.roadmap.findFirst({
      where: { userId },
      include: { tasks: { orderBy: { sortOrder: 'asc' } }, career: true },
      orderBy: { createdAt: 'desc' },
    });
    return JSON.stringify(
      roadmap
        ? {
            title: roadmap.title,
            career: roadmap.career.title,
            tasks: roadmap.tasks.map((t) => ({
              title: t.title,
              status: t.status,
              phase: t.phase,
              relatedSkill: t.relatedSkill,
              why: t.why,
            })),
          }
        : { error: 'No roadmap yet' },
    );
  }

  async getDocuments(userId: string) {
    const docs = await this.prisma.document.findMany({
      where: { userId },
      include: { extraction: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return JSON.stringify(
      docs.map((d) => ({
        filename: d.filename,
        type: d.type,
        status: d.status,
        extraction: d.extraction
          ? {
              degree: d.extraction.degree,
              subjects: d.extraction.subjects,
              skillsDetected: d.extraction.skillsDetected,
              summary: d.extraction.summary,
            }
          : null,
      })),
    );
  }

  async listJobs() {
    const jobs = await this.prisma.job.findMany({
      where: { isDemo: false },
      include: { skills: { include: { skill: true } } },
      take: 20,
    });
    return JSON.stringify(
      jobs.map((j) => ({
        company: j.company,
        role: j.role,
        location: j.location,
        workType: j.workType,
        experience: j.experience,
        description: j.description,
        skills: j.skills.map((s) => ({ name: s.skill.name, isMissing: s.isMissing })),
      })),
    );
  }

  async listJobMatches(userId: string) {
    const matches = await this.prisma.jobMatch.findMany({
      where: { userId, job: { isDemo: false } },
      include: { job: true },
      orderBy: { matchPercent: 'desc' },
      take: 15,
    });
    return JSON.stringify(
      matches.map((m) => ({
        company: m.job.company,
        role: m.job.role,
        matchPercent: m.matchPercent,
        matchLabel: m.matchLabel,
        whyMatches: m.whyMatches,
      })),
    );
  }

  async listGovernmentOpportunities(userId: string) {
    const rows = await this.prisma.governmentOpportunity.findMany({
      include: {
        eligibilities: { where: { userId } },
      },
      take: 15,
    });
    return JSON.stringify(
      rows.map((o) => ({
        organization: o.organization,
        opportunity: o.opportunity,
        eligibility: o.eligibility,
        ageRequirement: o.ageRequirement,
        educationRequirement: o.educationRequirement,
        deadline: o.deadline,
        userEligibility: o.eligibilities[0]?.status ?? null,
      })),
    );
  }

  async listGovernmentExams(userId: string) {
    const exams = await this.prisma.governmentExam.findMany({
      include: { subjects: { orderBy: { sortOrder: 'asc' } } },
      take: 20,
    });
    const plan = await this.prisma.governmentExamPlan.findFirst({
      where: { userId, isActive: true },
      include: { exam: true, progress: true },
    });
    return JSON.stringify({
      exams: exams.map((e) => ({
        slug: e.slug,
        name: e.name,
        shortName: e.shortName,
        category: e.category,
        overview: e.overview,
        eligibility: e.eligibility,
        ageLimit: e.ageLimit,
        educationRequirement: e.educationRequirement,
        stages: e.stages,
        subjects: e.subjects.map((s) => ({
          name: s.name,
          weightage: s.weightage,
          topics: s.topics,
        })),
      })),
      activePlan: plan
        ? {
            exam: plan.exam.shortName,
            dailyMinutes: plan.dailyMinutes,
            targetYear: plan.targetYear,
            progress: plan.progress,
          }
        : null,
    });
  }

  async getSarkariJudgment(userId: string) {
    try {
      return JSON.stringify(await this.sarkariJudge.forUser(userId));
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  async retrieveSarkariKnowledge(userId: string, query: string) {
    const plan = await this.prisma.governmentExamPlan.findFirst({
      where: { userId, isActive: true },
      include: { exam: true },
    });
    const hits = await this.sarkariRag.retrieve(query, plan?.exam.slug, 5).catch(() => []);
    return JSON.stringify({
      note: 'Sarkari collection only. Notices are unofficial colour — verify the official PDF.',
      hits,
    });
  }

  async getLatestResearch(userId: string) {
    const session = await this.prisma.researchSession.findFirst({
      where: { userId },
      include: { sources: true, findings: true },
      orderBy: { createdAt: 'desc' },
    });
    return JSON.stringify(
      session
        ? {
            query: session.query,
            summary: session.summary,
            sources: session.sources,
            findings: session.findings,
          }
        : { error: 'No research session yet' },
    );
  }

  async compactSnapshot(userId: string) {
    try {
      const profile = await this.prisma.profile.findUnique({ where: { userId } });
      const gov = profile?.careerTrack === CareerTrack.GOVERNMENT_EXAM;
      const [profileJson, goalJson, docsJson, judgeJson] = await Promise.all([
        this.getMyProfile(userId),
        gov ? this.listGovernmentExams(userId) : this.getCareerGoal(userId),
        this.getDocuments(userId),
        gov ? this.getSarkariJudgment(userId) : Promise.resolve('null'),
      ]);
      return JSON.stringify({
        profile: this.safeJson(profileJson),
        goal: this.safeJson(goalJson),
        documents: this.safeJson(docsJson),
        sarkari: gov ? this.safeJson(judgeJson) : undefined,
        note: gov
          ? 'Sarkari track. Use age/education/knowledge flags and the exam catalog. Do not invent FitScore.'
          : 'Private track. Use stored skills and the role syllabus.',
      }).slice(0, 12000);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message, note: 'Snapshot incomplete' });
    }
  }

  private safeJson(raw: string) {
    try {
      return JSON.parse(raw);
    } catch {
      return { error: 'unreadable' };
    }
  }
}
