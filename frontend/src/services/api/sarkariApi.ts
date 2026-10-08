import type { GovernmentExamDetail, GovernmentExamSummary, SarkariJudge, TaskStatus } from "@/types";
import { http } from "../http";
import { mapEnum } from "../mappers";

function mapExam(raw: Record<string, unknown>): GovernmentExamDetail {
  const subjects = (raw.subjects as Array<Record<string, unknown>> | undefined) ?? [];
  const planRaw = (raw.plan as Record<string, unknown> | null) ?? null;
  return {
    id: String(raw.id),
    slug: String(raw.slug),
    name: String(raw.name),
    shortName: String(raw.shortName),
    conductingBody: String(raw.conductingBody),
    category: String(raw.category),
    overview: String(raw.overview ?? ""),
    eligibility: String(raw.eligibility ?? ""),
    ageLimit: raw.ageLimit ? String(raw.ageLimit) : null,
    educationRequirement: raw.educationRequirement ? String(raw.educationRequirement) : null,
    examPattern: raw.examPattern,
    stages: Array.isArray(raw.stages) ? (raw.stages as string[]) : [],
    officialNote: raw.officialNote ? String(raw.officialNote) : null,
    subjects: subjects.map((s) => ({
      id: String(s.id),
      name: String(s.name),
      weightage: s.weightage ? String(s.weightage) : null,
      topics: ((s.topics as Array<Record<string, unknown>>) ?? []).map((t) => ({
        name: String(t.name),
        status: mapEnum(String(t.status), "not_started") as TaskStatus,
        revisedCount: Number(t.revisedCount ?? 0),
      })),
    })),
    plan: planRaw
      ? {
          id: String(planRaw.id),
          isActive: Boolean(planRaw.isActive),
          targetYear: planRaw.targetYear ? Number(planRaw.targetYear) : null,
          dailyMinutes: Number(planRaw.dailyMinutes ?? 120),
          completionPercent: Number(planRaw.completionPercent ?? 0),
          roadmap: ((planRaw.roadmap as Array<Record<string, unknown>>) ?? []).map((r) => ({
            phase: String(r.phase),
            focus: String(r.focus),
            tasks: Array.isArray(r.tasks) ? (r.tasks as string[]) : [],
          })),
        }
      : null,
  };
}

export async function listExams(): Promise<GovernmentExamSummary[]> {
  const rows = await http.get<Record<string, unknown>[]>("/government-exams");
  return rows.map((e) => ({
    id: String(e.id),
    slug: String(e.slug),
    name: String(e.name),
    shortName: String(e.shortName),
    conductingBody: String(e.conductingBody),
    category: String(e.category),
    overview: String(e.overview ?? ""),
    ageLimit: e.ageLimit ? String(e.ageLimit) : null,
    educationRequirement: e.educationRequirement ? String(e.educationRequirement) : null,
    stages: Array.isArray(e.stages) ? (e.stages as string[]) : [],
    subjectCount: Number(e.subjectCount ?? 0),
    officialNote: e.officialNote ? String(e.officialNote) : null,
  }));
}

export async function getExam(slug: string): Promise<GovernmentExamDetail> {
  const raw = await http.get<Record<string, unknown>>(`/government-exams/${slug}`);
  return mapExam(raw);
}

export async function getMyExamPlan(): Promise<GovernmentExamDetail | null> {
  const raw = await http.get<{ plan: Record<string, unknown> | null }>("/government-exams/me/plan");
  return raw.plan ? mapExam(raw.plan) : null;
}

export async function startExamPlan(slug: string): Promise<GovernmentExamDetail> {
  const raw = await http.post<Record<string, unknown>>(`/government-exams/${slug}/plan`, {
    dailyMinutes: 120,
    targetYear: new Date().getFullYear() + 1,
  });
  return mapExam(raw);
}

export async function updateExamTopic(input: {
  examSlug: string;
  subjectId: string;
  topic: string;
  status: TaskStatus;
}): Promise<GovernmentExamDetail> {
  const raw = await http.patch<Record<string, unknown>>("/government-exams/progress", {
    examSlug: input.examSlug,
    subjectId: input.subjectId,
    topic: input.topic,
    status: input.status.toUpperCase(),
  });
  return mapExam(raw);
}

export async function getJudge(): Promise<SarkariJudge> {
  return http.get<SarkariJudge>("/sarkari/judge");
}

export async function refreshInternet() {
  return http.post<{
    exam: { slug: string; shortName: string };
    fetched: Array<{ url: string; site: string; ok: boolean }>;
    note: string;
    snapshots: SarkariJudge["snapshots"];
  }>("/sarkari/internet/refresh", {});
}

export async function logMock(input: {
  examSlug: string;
  subjectId?: string;
  scorePercent: number;
  note?: string;
}) {
  return http.post("/government-exams/mocks", input);
}
