import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType, EducationLevel, TaskStatus, UserStatus } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SarkariDocsService, type SarkariPaper } from './sarkari-docs.service';
import { SarkariInternetService } from './sarkari-internet.service';

export type FlagStatus = 'match' | 'not_yet' | 'outside' | 'unknown';

@Injectable()
export class SarkariJudgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docs: SarkariDocsService,
    private readonly internet: SarkariInternetService,
  ) {}

  async forUser(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    const plan = await this.prisma.governmentExamPlan.findFirst({
      where: { userId, isActive: true },
      include: {
        exam: { include: { subjects: { orderBy: { sortOrder: 'asc' } } } },
        progress: true,
      },
    });

    const documents = await this.prisma.document.findMany({
      where: { userId },
      include: { extraction: true },
    });
    const classified = this.docs.classify(documents);
    const student = profile?.status === UserStatus.STUDENT;
    const educationLevel = profile?.educationLevel ?? EducationLevel.HIGH_SCHOOL;

    if (!plan) {
      return {
        exam: null,
        age: unknownFlag('Pick an exam plan first.'),
        education: unknownFlag('Pick an exam plan first.'),
        knowledge: unknownFlag('Pick an exam plan first.'),
        documents: this.docSummary(educationLevel, classified, student),
        snapshots: [],
        disclaimer: 'Not a legal eligibility certificate. Verify the official notification.',
      };
    }

    const exam = plan.exam;
    const ageLimit = exam.ageLimit || exam.eligibility;
    const educationRequirement = exam.educationRequirement || exam.eligibility;
    const mocks = await this.prisma.sarkariMockAttempt.findMany({
      where: { userId, examId: exam.id },
      orderBy: { takenAt: 'desc' },
    });
    const snapshots = await this.internet.listForExam(exam.id).catch(() => []);
    const knowledge = this.knowledgeFlag(exam.subjects, plan.progress, mocks);
    const studyNext = (knowledge.papers ?? [])
      .filter((p) => p.mockPercent == null && p.tickPercent < 100)
      .map((p) => p.name);
    const studied = (knowledge.papers ?? [])
      .filter((p) => p.tickPercent > 0 || (p.mockPercent != null && p.mockPercent >= 50))
      .map((p) => p.name);

    return {
      exam: {
        id: exam.id,
        slug: exam.slug,
        shortName: exam.shortName,
        name: exam.name,
        ageLimit: exam.ageLimit || ageLimit,
        educationRequirement: exam.educationRequirement || educationRequirement,
      },
      age: this.ageFlag(classified, ageLimit),
      education: this.educationFlag(classified, educationLevel, student, educationRequirement),
      knowledge,
      studyNext,
      studied,
      capability: this.capabilityLine(classified, studyNext),
      documents: this.docSummary(educationLevel, classified, student),
      snapshots,
      disclaimer: 'Not a legal eligibility certificate. Internet notices are colour only — verify the official PDF.',
    };
  }

  private ageFlag(classified: ReturnType<SarkariDocsService['classify']>, ageLimit: string | null) {
    const tenthFile = classified.find((c) => c.paper === 'tenth');
    const tenth = classified.find((c) => c.paper === 'tenth' && c.dateOfBirth) ?? classified.find((c) => c.dateOfBirth);
    const dob = tenth?.dateOfBirth ?? null;
    const band = parseAgeBand(ageLimit);
    if (!dob) {
      return {
        status: 'unknown' as FlagStatus,
        detail: tenthFile
          ? `Class 10 file “${tenthFile.filename}” is saved, but we could not read a printed date of birth from the extraction. Re-upload a clearer photo, or confirm DOB is visible on the paper.`
          : 'Upload a Class 10 marksheet so we can read date of birth.',
        years: null as number | null,
        band,
      };
    }
    const years = yearsSince(dob);
    if (years == null) {
      return { status: 'unknown' as FlagStatus, detail: `Could not parse DOB (${dob}).`, years: null, band };
    }
    if (!band) {
      return {
        status: 'unknown' as FlagStatus,
        detail: `Age about ${years} from 10th DOB. Catalog age line is missing or unparsed.`,
        years,
        band: null,
      };
    }
    const inside = years >= band.min && years <= band.max;
    return {
      status: (inside ? 'match' : 'outside') as FlagStatus,
      detail: inside
        ? `About ${years} years — within ${band.min}–${band.max} on the catalog row.`
        : `About ${years} years — outside ${band.min}–${band.max} on the catalog row. Confirm the official notice.`,
      years,
      band,
    };
  }

  private educationFlag(
    classified: ReturnType<SarkariDocsService['classify']>,
    educationLevel: EducationLevel,
    student: boolean,
    requirement: string | null,
  ) {
    const want = wantPaper(requirement);
    const have = this.havePaper(classified, educationLevel, student);
    if (!want) {
      return {
        status: 'unknown' as FlagStatus,
        detail: 'This exam has no education line in the catalog.',
        have,
        want: null as SarkariPaper | null,
      };
    }
    if (have === 'none') {
      return {
        status: 'unknown' as FlagStatus,
        detail: 'Upload marksheets/degree so we can see your highest class.',
        have,
        want,
      };
    }
    const rank = { none: 0, tenth: 1, twelfth: 2, grad: 3 };
    const ok = rank[have] >= rank[want] && !(want === 'grad' && student && !classified.some((c) => c.paper === 'grad'));
    if (want === 'grad' && student && !classified.some((c) => c.type === DocumentType.DEGREE || c.paper === 'grad')) {
      return {
        status: 'not_yet' as FlagStatus,
        detail: `Catalog wants graduation. Highest we see is ${have}. Finish the degree (or upload it).`,
        have,
        want,
      };
    }
    return {
      status: (ok ? 'match' : 'not_yet') as FlagStatus,
      detail: ok
        ? `Highest paper ${have} meets catalog ${want}.`
        : `Catalog wants ${want}. Highest paper we have is ${have}.`,
      have,
      want,
    };
  }

  private knowledgeFlag(
    subjects: Array<{ id: string; name: string; topics: string[] }>,
    progress: Array<{ subjectId: string; topic: string; status: TaskStatus }>,
    mocks: Array<{ subjectId: string | null; scorePercent: number }>,
  ) {
    if (!mocks.length) {
      return {
        status: 'unknown' as FlagStatus,
        detail: 'Knowledge stays unknown until you log a mock or diagnostic for this exam. Board marks are not used.',
        papers: subjects.map((s) => ({
          subjectId: s.id,
          name: s.name,
          mockPercent: null as number | null,
          tickPercent: tickPercent(s, progress),
        })),
      };
    }
    const papers = subjects.map((s) => {
      const mock = mocks.find((m) => m.subjectId === s.id) ?? mocks.find((m) => !m.subjectId);
      return {
        subjectId: s.id,
        name: s.name,
        mockPercent: mock?.scorePercent ?? null,
        tickPercent: tickPercent(s, progress),
      };
    });
    const scored = papers.filter((p) => p.mockPercent != null);
    const avg = scored.length
      ? Math.round(scored.reduce((a, p) => a + (p.mockPercent ?? 0), 0) / scored.length)
      : 0;
    const weak = papers.filter((p) => (p.mockPercent ?? 0) < 50).map((p) => p.name);
    return {
      status: (avg >= 50 ? 'match' : 'not_yet') as FlagStatus,
      detail:
        weak.length > 0
          ? `Mock average ${avg}%. Weak / untested: ${weak.join(', ')}.`
          : `Mock average ${avg}% across logged papers.`,
      papers,
    };
  }

  private havePaper(
    classified: ReturnType<SarkariDocsService['classify']>,
    educationLevel: EducationLevel,
    student: boolean,
  ): SarkariPaper | 'none' {
    if (classified.some((c) => c.paper === 'grad' || c.type === DocumentType.DEGREE)) return 'grad';
    if (!student && (educationLevel === EducationLevel.UNDERGRADUATE || educationLevel === EducationLevel.POSTGRADUATE)) {
      return 'grad';
    }
    if (
      classified.some((c) => c.paper === 'twelfth') ||
      educationLevel === EducationLevel.DIPLOMA ||
      educationLevel === EducationLevel.INTERMEDIATE
    ) {
      return 'twelfth';
    }
    if (classified.some((c) => c.paper === 'tenth') || educationLevel === EducationLevel.HIGH_SCHOOL) return 'tenth';
    return 'none';
  }

  private docSummary(
    educationLevel: EducationLevel,
    classified: ReturnType<SarkariDocsService['classify']>,
    student: boolean,
  ) {
    return {
      ladder: this.docs.ladder(educationLevel),
      have: classified.filter((c) => c.paper !== 'other').map((c) => ({ id: c.id, paper: c.paper, filename: c.filename })),
      missing: this.docs.missingPapers(educationLevel, classified, student),
    };
  }

  private capabilityLine(
    classified: ReturnType<SarkariDocsService['classify']>,
    studyNext: string[],
  ) {
    const papers = classified.filter((c) => c.paper !== 'other').map((c) => c.paper);
    const seen = papers.length ? `Seen papers: ${[...new Set(papers)].join(', ')}.` : 'No class papers classified yet.';
    const next = studyNext.length
      ? `Study next (no mock yet): ${studyNext.join(', ')}.`
      : 'Log a mock to score knowledge.';
    return `${seen} ${next} Board marks are not used as capability.`;
  }
}

function unknownFlag(detail: string) {
  return { status: 'unknown' as FlagStatus, detail };
}

function wantPaper(requirement: string | null): SarkariPaper | null {
  if (!requirement) return null;
  const t = requirement.toLowerCase();
  if (/graduate|graduation|bachelor|degree/.test(t)) return 'grad';
  if (/12|xii|intermediate|higher secondary|10\s*\+\s*2|diploma/.test(t)) return 'twelfth';
  if (/10|matric|sslc/.test(t)) return 'tenth';
  return 'grad';
}

function parseAgeBand(ageLimit: string | null): { min: number; max: number } | null {
  if (!ageLimit) return null;
  const m = ageLimit.match(/(\d{1,2})\s*(?:-|to|–|—)\s*(\d{1,2})/i);
  if (!m) return null;
  return { min: Number(m[1]), max: Number(m[2]) };
}

function yearsSince(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const md = now.getMonth() - d.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < d.getDate())) years -= 1;
  return years;
}

function tickPercent(
  subject: { id: string; topics: string[] },
  progress: Array<{ subjectId: string; topic: string; status: TaskStatus }>,
) {
  if (!subject.topics.length) return 0;
  const done = subject.topics.filter((topic) =>
    progress.some((p) => p.subjectId === subject.id && p.topic === topic && p.status === TaskStatus.COMPLETED),
  ).length;
  return Math.round((done / subject.topics.length) * 100);
}
