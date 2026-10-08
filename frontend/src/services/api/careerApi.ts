import type {
  Career,
  CareerAnalysis,
  EvidenceItem,
  Job,
  Roadmap,
  RoadmapTask,
  SkillGapItem,
  SkillLesson,
  PracticeCheck,
  WhyExplanation,
} from "@/types";
import { http } from "../http";
import { mapEnum, mapPhase, mapTaskStatus, toTaskStatusApi } from "../mappers";

function mapWhy(raw: unknown): WhyExplanation {
  if (raw && typeof raw === "object") {
    const w = raw as Record<string, unknown>;
    const text = (key: string) => (typeof w[key] === "string" ? (w[key] as string) : undefined);
    return {
      recommendation: text("recommendation") ?? "",
      currentProfile: text("currentProfile") ?? "",
      targetCareer: text("targetCareer") ?? "",
      marketEvidence: text("marketEvidence") ?? "",
      reason: text("reason") ?? "",
      practice: text("practice"),
      example: text("example"),
      solution: text("solution"),
      learnWhere: Array.isArray(w.learnWhere) ? w.learnWhere.map(String) : undefined,
    };
  }
  return {
    recommendation: String(raw ?? ""),
    currentProfile: "",
    targetCareer: "",
    marketEvidence: "",
    reason: String(raw ?? ""),
  };
}

function mapCareer(raw: Record<string, unknown>): Career {
  const requirements = (raw.requirements as Array<Record<string, unknown>>) ?? [];
  return {
    id: String(raw.id),
    title: String(raw.title),
    slug: String(raw.slug),
    overview: String(raw.overview ?? ""),
    marketExpectations: String(raw.marketExpectations ?? ""),
    entryLevelExpectations: String(raw.entryLevelExpectations ?? ""),
    requirements: requirements.map((r) => {
      const skill = (r.skill as Record<string, unknown> | undefined) ?? {};
      return {
        skill: String(skill.name ?? r.skill ?? ""),
        category: String(skill.category ?? "Tools"),
        importance: mapEnum(String(r.importance), "medium"),
        type: mapEnum(String(r.type), "required") as Career["requirements"][number]["type"],
      };
    }),
    stackLanes: ((raw.stackLanes as Array<{ id: string; label: string }>) ?? []).map((l) => ({
      id: String(l.id),
      label: String(l.label),
    })),
  };
}

function mapAnalysis(raw: Record<string, unknown>): CareerAnalysis {
  const breakdown = (raw.breakdown as Record<string, number> | null) ?? {
    skills: 0,
    projects: 0,
    education: 0,
    experience: 0,
    marketAlignment: 0,
  };
  return {
    careerTitle: String(raw.careerTitle ?? ""),
    analyzed: Boolean(raw.analyzed),
    estimatedMatch: Number(raw.estimatedMatch ?? 0),
    breakdown: {
      skills: Number(breakdown.skills ?? 0),
      projects: Number(breakdown.projects ?? 0),
      education: Number(breakdown.education ?? 0),
      experience: Number(breakdown.experience ?? 0),
      marketAlignment: Number(breakdown.marketAlignment ?? 0),
    },
    whyItMayFit: (raw.whyItMayFit as string[]) ?? [],
    strongAreas: (raw.strongAreas as string[]) ?? [],
    missingAreas: (raw.missingAreas as string[]) ?? [],
    potentialChallenges: (raw.potentialChallenges as string[]) ?? [],
    evidenceIds: Array.isArray(raw.evidence)
      ? (raw.evidence as Array<{ id?: string }>).map((e, i) => String(e.id ?? i))
      : [],
  };
}

function mapTask(raw: Record<string, unknown>): RoadmapTask {
  return {
    id: String(raw.id),
    title: String(raw.title),
    description: String(raw.description ?? ""),
    why: String(raw.why ?? ""),
    priority: mapEnum(String(raw.priority), "medium"),
    estimatedEffort: String(raw.estimatedEffort ?? ""),
    status: mapTaskStatus(String(raw.status)) as RoadmapTask["status"],
    relatedSkill: String(raw.relatedSkill ?? ""),
    suggestedResource: String(raw.suggestedResource ?? ""),
    phase: mapPhase(String(raw.phase)),
    note: raw.note ? String(raw.note) : undefined,
  };
}

export async function listCareers(): Promise<Career[]> {
  const rows = await http.get<Record<string, unknown>[]>("/careers");
  return rows.map(mapCareer);
}

export async function getCareer(slug = "backend-developer"): Promise<Career> {
  const raw = await http.get<Record<string, unknown>>(`/careers/${slug}`);
  return mapCareer(raw);
}

export async function getCareerAnalysis(): Promise<CareerAnalysis> {
  const raw = await http.get<Record<string, unknown>>("/career-analysis");
  return mapAnalysis(raw);
}

export async function getDashboard() {
  const raw = await http.get<Record<string, unknown>>("/dashboard");
  const analysisRaw = raw.analysis as Record<string, unknown> | null;
  const roadmapRaw = raw.roadmap as Record<string, unknown> | null;
  return {
    analysis: analysisRaw ? mapAnalysis(analysisRaw) : null,
    skillGaps: ((raw.skillGaps as Array<Record<string, unknown>>) ?? []).map(mapSkillGap),
    roadmap: roadmapRaw
      ? {
          careerTitle: String(roadmapRaw.careerTitle ?? ""),
          syllabusPercent: Number(roadmapRaw.syllabusPercent ?? 0),
          completed: Number(roadmapRaw.completed ?? 0),
          total: Number(roadmapRaw.total ?? 0),
        }
      : null,
    jobs: ((raw.jobs as Array<Record<string, unknown>>) ?? []).map((j) => ({
      id: String(j.id),
      company: String(j.company),
      role: String(j.role),
      location: String(j.location ?? ""),
      workType: String(j.workType ?? "hybrid").toLowerCase(),
      experience: String(j.experience ?? ""),
      matchPercent: 0,
      matchLabel: "potential" as const,
      matchedSkills: (j.matchedSkills as string[]) ?? [],
      missingSkills: (j.missingSkills as string[]) ?? [],
      whyMatches: String(j.whyMatches ?? ""),
      priority: "medium" as const,
      isMock: true as const,
    })) as Job[],
    government: (raw.government as Array<Record<string, unknown>>) ?? [],
    examPlan: (raw.examPlan as { slug: string; shortName: string; completionPercent: number } | null) ?? null,
    sarkariJudge: (raw.sarkariJudge as import("@/types").SarkariJudge | null) ?? null,
    evidence: (raw.evidence as {
      stack: string | null;
      stackLabel: string | null;
      confidence: number;
      stackOptions: Array<{ id: string; label: string }>;
      seniority: "none" | "intern" | "job";
      suggestedStatus: string | null;
      needsStackConfirm: boolean;
      studyNext: string[];
      optional: string[];
      alternatives: string[];
    } | null) ?? null,
  };
}

/** Generates a fresh LLM-backed analysis. Slow by nature — show a loader. */
export async function runCareerAnalysis(): Promise<CareerAnalysis> {
  const raw = await http.post<Record<string, unknown>>("/career-analysis/run");
  return mapAnalysis(raw);
}

export async function getEvidence(): Promise<EvidenceItem[]> {
  const raw = await http.get<Record<string, unknown>>("/career-analysis");
  const evidence = raw.evidence;
  if (!Array.isArray(evidence)) return [];
  return evidence.map((e: Record<string, unknown>, i: number) => ({
    id: String(e.id ?? i),
    kind: mapEnum(String(e.kind ?? "research"), "research"),
    title: String(e.title ?? "Evidence"),
    detail: String(e.detail ?? e.reason ?? ""),
    sourceLabel: String(e.sourceLabel ?? "Server"),
  }));
}

function mapSkillGap(g: Record<string, unknown>): SkillGapItem {
  const status = mapEnum(String(g.currentStatus), "missing") as SkillGapItem["currentStatus"];
  const fallback =
    status === "strong" ? 90 : status === "good" ? 70 : status === "needs_improvement" ? 40 : 8;
  return {
    id: String(g.id ?? g.skill ?? ""),
    skill: String(g.skill),
    category: String(g.category ?? "Tools"),
    currentStatus: status,
    required: Boolean(g.required),
    priority: mapEnum(String(g.priority), "medium"),
    estimatedHours: Number(g.estimatedHours ?? 0),
    proficiency: Number(g.proficiency ?? fallback),
    stretch: Boolean(g.stretch) || !g.required,
    why: mapWhy(g.why),
  };
}

export async function getSkillGaps(): Promise<SkillGapItem[]> {
  const rows = await http.get<Array<Record<string, unknown>>>("/skill-gaps");
  return rows.map(mapSkillGap);
}

/** Recomputes gaps from the saved profile against the active goal's requirements. */
export async function recalculateSkillGaps(): Promise<SkillGapItem[]> {
  const rows = await http.post<Array<Record<string, unknown>>>("/skill-gaps/recalculate");
  return rows.map(mapSkillGap);
}

export async function getSkillLesson(id: string, phase?: string): Promise<SkillLesson> {
  const qs = phase ? `?phase=${encodeURIComponent(phase)}` : "";
  const raw = await http.get<Record<string, unknown>>(`/skill-gaps/${id}/lesson${qs}`, {
    timeoutMs: 90_000,
  });
  const questions = Array.isArray(raw.questions)
    ? (raw.questions as Array<Record<string, unknown>>).map((q) => ({
        id: String(q.id ?? ""),
        prompt: String(q.prompt ?? ""),
      }))
    : [];
  return {
    skill: String(raw.skill ?? ""),
    learn: String(raw.learn ?? ""),
    practice: String(raw.practice ?? ""),
    example: String(raw.example ?? ""),
    outline: Array.isArray(raw.outline) ? raw.outline.map(String) : [],
    level: raw.level ? String(raw.level) : undefined,
    evidenced: Boolean(raw.evidenced),
    band: raw.band ? String(raw.band) : undefined,
    seniority: raw.seniority as SkillLesson["seniority"],
    educationLevel: raw.educationLevel ? String(raw.educationLevel) : undefined,
    where: Array.isArray(raw.where) ? raw.where.map(String) : [],
    questions,
    evidencePrompt: raw.evidencePrompt ? String(raw.evidencePrompt) : undefined,
    phase: raw.phase ? String(raw.phase) : undefined,
    questionCount: raw.questionCount != null ? Number(raw.questionCount) : undefined,
  };
}

export async function practiceSkillGap(
  id: string,
  note?: string,
  answers?: Array<{ id: string; text: string; prompt?: string }>,
): Promise<{ gaps: SkillGapItem[]; check?: PracticeCheck }> {
  const raw = await http.post<Record<string, unknown>>(
    `/skill-gaps/${id}/practice`,
    { note, answers },
    { timeoutMs: 120_000 },
  );
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.gaps)
      ? (raw.gaps as Array<Record<string, unknown>>)
      : [];
  const checkRaw = !Array.isArray(raw) && raw.check && typeof raw.check === "object" ? (raw.check as Record<string, unknown>) : null;
  return {
    gaps: rows.map(mapSkillGap),
    check: checkRaw
      ? {
          score: Number(checkRaw.score ?? 0),
          passed: Boolean(checkRaw.passed),
          feedback: String(checkRaw.feedback ?? ""),
        }
      : undefined,
  };
}

export async function generateRoadmap(): Promise<Roadmap> {
  const raw = await http.post<Record<string, unknown>>("/roadmap/generate");
  return mapRoadmap(raw);
}

export async function getRoadmap(phase?: string): Promise<Roadmap> {
  const qs = phase ? `?phase=${encodeURIComponent(phase)}` : "";
  const raw = await http.get<Record<string, unknown>>(`/roadmap${qs}`);
  return mapRoadmap(raw);
}

function mapRoadmap(raw: Record<string, unknown>): Roadmap {
  return {
    careerTitle: String(raw.careerTitle ?? ""),
    syllabusPercent: raw.syllabusPercent != null ? Number(raw.syllabusPercent) : undefined,
    stackLabel: raw.stackLabel ? String(raw.stackLabel) : null,
    seniority: raw.seniority ? (String(raw.seniority) as Roadmap["seniority"]) : undefined,
    learnerTier: raw.learnerTier ? (String(raw.learnerTier) as Roadmap["learnerTier"]) : undefined,
    roleSkillMatchPercent:
      raw.roleSkillMatchPercent != null ? Number(raw.roleSkillMatchPercent) : undefined,
    pathLabel: raw.pathLabel ? String(raw.pathLabel) : undefined,
    pathDetail: raw.pathDetail ? String(raw.pathDetail) : undefined,
    studyNext: Array.isArray(raw.studyNext) ? (raw.studyNext as string[]) : [],
    optional: Array.isArray(raw.optional) ? (raw.optional as string[]) : [],
    alternatives: Array.isArray(raw.alternatives) ? (raw.alternatives as string[]) : [],
    unlockedPhases: Array.isArray(raw.unlockedPhases)
      ? (raw.unlockedPhases as string[]).map((p) => mapPhase(String(p)))
      : undefined,
    phaseCounts: (raw.phaseCounts as Roadmap["phaseCounts"]) ?? undefined,
    preparation:
      raw.preparation && typeof raw.preparation === "object"
        ? {
            completed: Number((raw.preparation as { completed?: number }).completed ?? 0),
            total: Number((raw.preparation as { total?: number }).total ?? 0),
            percent: Number((raw.preparation as { percent?: number }).percent ?? 0),
          }
        : undefined,
    tasks: ((raw.tasks as Array<Record<string, unknown>>) ?? []).map(mapTask),
  };
}

export type RoadmapCheck = {
  score: number;
  passed: boolean;
  feedback: string;
  proficiency: string;
  accuracy: string;
};

export async function checkRoadmapTask(
  id: string,
  answer: string,
  phase?: string,
): Promise<{ roadmap: Roadmap; check: RoadmapCheck }> {
  const qs = phase ? `?phase=${encodeURIComponent(phase)}` : "";
  const raw = await http.post<Record<string, unknown>>(`/roadmap/tasks/${id}/check${qs}`, { answer });
  const checkRaw = (raw.check && typeof raw.check === "object" ? raw.check : {}) as Record<string, unknown>;
  const roadmapRaw = (raw.roadmap && typeof raw.roadmap === "object" ? raw.roadmap : raw) as Record<string, unknown>;
  return {
    roadmap: mapRoadmap(roadmapRaw),
    check: {
      score: Number(checkRaw.score ?? 0),
      passed: Boolean(checkRaw.passed),
      feedback: String(checkRaw.feedback ?? ""),
      proficiency: String(checkRaw.proficiency ?? "beginner"),
      accuracy: String(checkRaw.accuracy ?? ""),
    },
  };
}

export async function updateRoadmapTask(
  id: string,
  patch: Partial<Pick<RoadmapTask, "status" | "note">>,
  phase?: string,
): Promise<Roadmap> {
  const raw = await http.patch<Record<string, unknown>>(`/roadmap/tasks/${id}`, {
    status: patch.status ? toTaskStatusApi(patch.status) : undefined,
    note: patch.note,
  });
  if (!phase) return mapRoadmap(raw);
  return getRoadmap(phase);
}
