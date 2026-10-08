import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CareerTrack, Prisma, TaskStatus } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SarkariExamService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.governmentExam.findMany({
      orderBy: { shortName: 'asc' },
      include: { _count: { select: { subjects: true } } },
    }).then((rows) =>
      rows.map((e) => ({
        id: e.id,
        slug: e.slug,
        name: e.name,
        shortName: e.shortName,
        conductingBody: e.conductingBody,
        category: e.category,
        overview: e.overview,
        ageLimit: e.ageLimit,
        educationRequirement: e.educationRequirement,
        stages: e.stages,
        subjectCount: e._count.subjects,
        officialNote: e.officialNote,
      })),
    );
  }

  async get(slug: string, userId: string) {
    const exam = await this.prisma.governmentExam.findUnique({
      where: { slug },
      include: { subjects: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!exam) {
      throw new NotFoundException({ error: 'EXAM_NOT_FOUND', message: 'Exam not found' });
    }
    const plan = await this.prisma.governmentExamPlan.findUnique({
      where: { userId_examId: { userId, examId: exam.id } },
      include: { progress: true },
    });
    return this.mapExam(exam, plan);
  }

  async myPlan(userId: string) {
    const plan = await this.prisma.governmentExamPlan.findFirst({
      where: { userId, isActive: true },
      include: {
        exam: { include: { subjects: { orderBy: { sortOrder: 'asc' } } } },
        progress: true,
      },
    });
    if (!plan) return { plan: null };
    return { plan: this.mapExam(plan.exam, plan) };
  }

  async startPlan(userId: string, slug: string, dailyMinutes?: number, targetYear?: number) {
    const exam = await this.prisma.governmentExam.findUnique({
      where: { slug },
      include: { subjects: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!exam) {
      throw new NotFoundException({ error: 'EXAM_NOT_FOUND', message: 'Exam not found' });
    }

    await this.prisma.governmentExamPlan.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    const plan = await this.prisma.governmentExamPlan.upsert({
      where: { userId_examId: { userId, examId: exam.id } },
      update: {
        isActive: true,
        dailyMinutes: dailyMinutes ?? 120,
        targetYear: targetYear ?? new Date().getFullYear() + 1,
      },
      create: {
        userId,
        examId: exam.id,
        isActive: true,
        dailyMinutes: dailyMinutes ?? 120,
        targetYear: targetYear ?? new Date().getFullYear() + 1,
      },
      include: { progress: true },
    });

    await this.prisma.profile.updateMany({
      where: { userId },
      data: { careerTrack: CareerTrack.GOVERNMENT_EXAM },
    });

    return this.mapExam(exam, plan);
  }

  async updateTopic(
    userId: string,
    body: { examSlug: string; subjectId: string; topic: string; status: TaskStatus },
  ) {
    const exam = await this.prisma.governmentExam.findUnique({ where: { slug: body.examSlug } });
    if (!exam) {
      throw new NotFoundException({ error: 'EXAM_NOT_FOUND', message: 'Exam not found' });
    }
    const plan = await this.prisma.governmentExamPlan.findUnique({
      where: { userId_examId: { userId, examId: exam.id } },
    });
    if (!plan) {
      throw new BadRequestException({ error: 'NO_PLAN', message: 'Start a preparation plan first' });
    }
    const subject = await this.prisma.governmentExamSubject.findFirst({
      where: { id: body.subjectId, examId: exam.id },
    });
    if (!subject || !subject.topics.includes(body.topic)) {
      throw new BadRequestException({ error: 'TOPIC_INVALID', message: 'Topic is not part of this exam' });
    }

    await this.prisma.governmentExamTopicProgress.upsert({
      where: {
        planId_subjectId_topic: {
          planId: plan.id,
          subjectId: body.subjectId,
          topic: body.topic,
        },
      },
      update: {
        status: body.status,
        revisedCount: body.status === TaskStatus.COMPLETED ? { increment: 1 } : undefined,
        lastRevisedAt: new Date(),
      },
      create: {
        planId: plan.id,
        subjectId: body.subjectId,
        topic: body.topic,
        status: body.status,
        revisedCount: body.status === TaskStatus.COMPLETED ? 1 : 0,
        lastRevisedAt: new Date(),
      },
    });

    return this.get(body.examSlug, userId);
  }

  async logMock(
    userId: string,
    body: { examSlug: string; subjectId?: string; scorePercent: number; note?: string },
  ) {
    const exam = await this.prisma.governmentExam.findUnique({ where: { slug: body.examSlug } });
    if (!exam) {
      throw new NotFoundException({ error: 'EXAM_NOT_FOUND', message: 'Exam not found' });
    }
    if (body.scorePercent < 0 || body.scorePercent > 100) {
      throw new BadRequestException({ error: 'SCORE_INVALID', message: 'Score must be 0–100' });
    }
    if (body.subjectId) {
      const subject = await this.prisma.governmentExamSubject.findFirst({
        where: { id: body.subjectId, examId: exam.id },
      });
      if (!subject) {
        throw new BadRequestException({ error: 'SUBJECT_INVALID', message: 'Subject is not part of this exam' });
      }
    }
    const row = await this.prisma.sarkariMockAttempt.create({
      data: {
        userId,
        examId: exam.id,
        subjectId: body.subjectId || null,
        scorePercent: Math.round(body.scorePercent),
        note: body.note?.trim() || null,
      },
    });
    return {
      id: row.id,
      examSlug: exam.slug,
      subjectId: row.subjectId,
      scorePercent: row.scorePercent,
      takenAt: row.takenAt,
    };
  }

  async listMocks(userId: string, examSlug: string) {
    const exam = await this.prisma.governmentExam.findUnique({ where: { slug: examSlug } });
    if (!exam) {
      throw new NotFoundException({ error: 'EXAM_NOT_FOUND', message: 'Exam not found' });
    }
    return this.prisma.sarkariMockAttempt.findMany({
      where: { userId, examId: exam.id },
      orderBy: { takenAt: 'desc' },
      take: 40,
    });
  }

  private mapExam(
    exam: {
      id: string;
      slug: string;
      name: string;
      shortName: string;
      conductingBody: string;
      category: string;
      overview: string;
      eligibility: string;
      ageLimit: string | null;
      educationRequirement: string | null;
      examPattern: Prisma.JsonValue | null;
      stages: string[];
      officialNote: string | null;
      subjects: Array<{ id: string; name: string; weightage: string | null; topics: string[]; sortOrder: number }>;
    },
    plan: {
      id: string;
      isActive: boolean;
      targetYear: number | null;
      dailyMinutes: number;
      progress: Array<{ subjectId: string; topic: string; status: TaskStatus; revisedCount: number }>;
    } | null,
  ) {
    const progressMap = new Map(plan?.progress.map((p) => [`${p.subjectId}:${p.topic}`, p]) ?? []);
    const subjects = exam.subjects.map((s) => ({
      id: s.id,
      name: s.name,
      weightage: s.weightage,
      topics: s.topics.map((topic) => {
        const row = progressMap.get(`${s.id}:${topic}`);
        return {
          name: topic,
          status: row?.status ?? TaskStatus.NOT_STARTED,
          revisedCount: row?.revisedCount ?? 0,
        };
      }),
    }));
    const allTopics = subjects.flatMap((s) => s.topics);
    const done = allTopics.filter((t) => t.status === TaskStatus.COMPLETED).length;
    return {
      id: exam.id,
      slug: exam.slug,
      name: exam.name,
      shortName: exam.shortName,
      conductingBody: exam.conductingBody,
      category: exam.category,
      overview: exam.overview,
      eligibility: exam.eligibility,
      ageLimit: exam.ageLimit,
      educationRequirement: exam.educationRequirement,
      examPattern: exam.examPattern,
      stages: exam.stages,
      officialNote: exam.officialNote,
      subjects,
      plan: plan
        ? {
            id: plan.id,
            isActive: plan.isActive,
            targetYear: plan.targetYear,
            dailyMinutes: plan.dailyMinutes,
            completionPercent: allTopics.length ? Math.round((done / allTopics.length) * 100) : 0,
            roadmap: this.buildRoadmap(exam.shortName, exam.subjects.map((s) => s.name), plan.dailyMinutes),
          }
        : null,
    };
  }

  private buildRoadmap(examName: string, subjects: string[], dailyMinutes: number) {
    const hours = Math.max(1, Math.round(dailyMinutes / 60));
    return [
      {
        phase: '30 days',
        focus: `Foundation for ${examName}`,
        tasks: [
          `Daily ${hours}h: NCERT / basics for ${subjects[0] ?? 'GS'}`,
          'Build a newspaper + current-affairs notebook',
          'One mixed quiz every alternate day',
        ],
      },
      {
        phase: '60 days',
        focus: 'Speed and full syllabus coverage',
        tasks: [
          `Cover remaining papers: ${subjects.slice(1, 3).join(', ') || 'core papers'}`,
          'Sectional mocks twice a week',
          'Revise formula / polity notes every Sunday',
        ],
      },
      {
        phase: '90 days',
        focus: 'Exam simulation',
        tasks: [
          'Full-length mock every week',
          'Error log of last 200 questions',
          'Document checklist vs official notification (verify yourself)',
        ],
      },
    ];
  }
}
