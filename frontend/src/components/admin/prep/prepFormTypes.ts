export type QuestionType = "mcq" | "short" | "sql" | "code" | "practical" | "scenario" | "theory";

export type PrepObjective = {
  key: string;
  title: string;
  questionKeys: string[];
};

export type PrepLesson = {
  key: string;
  title: string;
  explanation: string;
  objectiveKey: string;
  questionKeys: string[];
  examples: string[];
  mistakes: string[];
};

export type PrepQuestion = {
  key: string;
  lessonKey: string;
  objectiveKey: string;
  type: QuestionType;
  prompt: string;
  options: Array<{ id: string; label: string }>;
  hints: string[];
  maxAttempts?: number;
};

export type PrepTask = {
  key: string;
  prompt: string;
  required: boolean;
  evidenceKind: "github" | "url" | "text" | "none";
  acceptanceCriteria: string[];
};

export type PrepResource = {
  title: string;
  url: string;
  kind: string;
  verified: boolean;
};

export type PrepContentForm = {
  schemaVersion: number;
  skillId: string;
  skillName: string;
  careerTitle: string;
  dailyHours: number | null;
  phase: string | null;
  estimatedMinutes: number;
  difficulty: "foundation" | "core" | "advanced";
  completionSummary: string;
  nextActionTemplate: string;
  objectives: PrepObjective[];
  lessons: PrepLesson[];
  questions: PrepQuestion[];
  tasks: PrepTask[];
  resources: PrepResource[];
  prerequisites: Array<{ skillId: string; name: string }>;
};

export type PrepRubricForm = {
  passLine: number;
  questions: Record<
    string,
    {
      correctOptionId?: string;
      modelAnswer?: string;
      keywords: string[];
      rubricPoints: string[];
    }
  >;
  tasks: Record<
    string,
    {
      requiresGithub?: boolean;
      evidenceKind?: "github" | "url" | "text" | "none";
      acceptPatterns: string[];
      minScore?: number;
    }
  >;
};

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function emptyContent(skillId = "", skillName = ""): PrepContentForm {
  return {
    schemaVersion: 1,
    skillId,
    skillName,
    careerTitle: "",
    dailyHours: null,
    phase: null,
    estimatedMinutes: 60,
    difficulty: "core",
    completionSummary: "",
    nextActionTemplate: "",
    objectives: [{ key: "obj-1", title: "", questionKeys: [] }],
    lessons: [
      {
        key: "lesson-1",
        title: "",
        explanation: "",
        objectiveKey: "obj-1",
        questionKeys: [],
        examples: [],
        mistakes: [],
      },
    ],
    questions: [
      {
        key: "q-1",
        lessonKey: "lesson-1",
        objectiveKey: "obj-1",
        type: "short",
        prompt: "",
        options: [],
        hints: [],
      },
    ],
    tasks: [],
    resources: [],
    prerequisites: [],
  };
}

export function emptyRubric(): PrepRubricForm {
  return { passLine: 70, questions: {}, tasks: {} };
}

export function parseContent(raw: Record<string, unknown> | null | undefined, fallbackSkill?: { id: string; name: string }): PrepContentForm {
  const base = emptyContent(fallbackSkill?.id ?? "", fallbackSkill?.name ?? "");
  if (!raw || typeof raw !== "object") return base;

  const objectives = Array.isArray(raw.objectives)
    ? raw.objectives.map((o, i) => {
        const row = (o ?? {}) as Record<string, unknown>;
        return {
          key: asString(row.key, `obj-${i + 1}`),
          title: asString(row.title),
          questionKeys: asStringArray(row.questionKeys),
        };
      })
    : base.objectives;

  const lessons = Array.isArray(raw.lessons)
    ? raw.lessons.map((l, i) => {
        const row = (l ?? {}) as Record<string, unknown>;
        return {
          key: asString(row.key, `lesson-${i + 1}`),
          title: asString(row.title),
          explanation: asString(row.explanation),
          objectiveKey: asString(row.objectiveKey, objectives[0]?.key ?? "obj-1"),
          questionKeys: asStringArray(row.questionKeys),
          examples: asStringArray(row.examples),
          mistakes: asStringArray(row.mistakes),
        };
      })
    : base.lessons;

  const questions = Array.isArray(raw.questions)
    ? raw.questions.map((q, i) => {
        const row = (q ?? {}) as Record<string, unknown>;
        const options = Array.isArray(row.options)
          ? row.options.map((opt, j) => {
              const o = (opt ?? {}) as Record<string, unknown>;
              return { id: asString(o.id, `opt-${j + 1}`), label: asString(o.label) };
            })
          : [];
        return {
          key: asString(row.key, `q-${i + 1}`),
          lessonKey: asString(row.lessonKey, lessons[0]?.key ?? "lesson-1"),
          objectiveKey: asString(row.objectiveKey, objectives[0]?.key ?? "obj-1"),
          type: (asString(row.type, "short") as QuestionType) || "short",
          prompt: asString(row.prompt),
          options,
          hints: asStringArray(row.hints),
          maxAttempts: typeof row.maxAttempts === "number" ? row.maxAttempts : undefined,
        };
      })
    : base.questions;

  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks.map((t, i) => {
        const row = (t ?? {}) as Record<string, unknown>;
        return {
          key: asString(row.key, `task-${i + 1}`),
          prompt: asString(row.prompt),
          required: Boolean(row.required),
          evidenceKind: (asString(row.evidenceKind, "github") as PrepTask["evidenceKind"]) || "github",
          acceptanceCriteria: asStringArray(row.acceptanceCriteria),
        };
      })
    : [];

  const resources = Array.isArray(raw.resources)
    ? raw.resources.map((r) => {
        const row = (r ?? {}) as Record<string, unknown>;
        return {
          title: asString(row.title),
          url: asString(row.url),
          kind: asString(row.kind, "article"),
          verified: Boolean(row.verified),
        };
      })
    : [];

  const prerequisites = Array.isArray(raw.prerequisites)
    ? raw.prerequisites.map((p) => {
        const row = (p ?? {}) as Record<string, unknown>;
        return { skillId: asString(row.skillId), name: asString(row.name) };
      })
    : [];

  return {
    schemaVersion: asNumber(raw.schemaVersion, 1),
    skillId: asString(raw.skillId, base.skillId),
    skillName: asString(raw.skillName, base.skillName),
    careerTitle: asString(raw.careerTitle),
    dailyHours: typeof raw.dailyHours === "number" ? raw.dailyHours : null,
    phase: typeof raw.phase === "string" ? raw.phase : null,
    estimatedMinutes: asNumber(raw.estimatedMinutes, 60),
    difficulty: (asString(raw.difficulty, "core") as PrepContentForm["difficulty"]) || "core",
    completionSummary: asString(raw.completionSummary),
    nextActionTemplate: asString(raw.nextActionTemplate),
    objectives,
    lessons,
    questions,
    tasks,
    resources,
    prerequisites,
  };
}

export function parseRubric(raw: Record<string, unknown> | null | undefined): PrepRubricForm {
  const base = emptyRubric();
  if (!raw || typeof raw !== "object") return base;
  const questions: PrepRubricForm["questions"] = {};
  const qRaw = raw.questions && typeof raw.questions === "object" ? (raw.questions as Record<string, unknown>) : {};
  for (const [key, val] of Object.entries(qRaw)) {
    const row = (val ?? {}) as Record<string, unknown>;
    questions[key] = {
      correctOptionId: typeof row.correctOptionId === "string" ? row.correctOptionId : undefined,
      modelAnswer: typeof row.modelAnswer === "string" ? row.modelAnswer : undefined,
      keywords: asStringArray(row.keywords),
      rubricPoints: asStringArray(row.rubricPoints),
    };
  }
  const tasks: PrepRubricForm["tasks"] = {};
  const tRaw = raw.tasks && typeof raw.tasks === "object" ? (raw.tasks as Record<string, unknown>) : {};
  for (const [key, val] of Object.entries(tRaw)) {
    const row = (val ?? {}) as Record<string, unknown>;
    tasks[key] = {
      requiresGithub: typeof row.requiresGithub === "boolean" ? row.requiresGithub : undefined,
      evidenceKind: typeof row.evidenceKind === "string" ? (row.evidenceKind as PrepRubricForm["tasks"][string]["evidenceKind"]) : undefined,
      acceptPatterns: asStringArray(row.acceptPatterns),
      minScore: typeof row.minScore === "number" ? row.minScore : undefined,
    };
  }
  return {
    passLine: asNumber(raw.passLine, 70),
    questions,
    tasks,
  };
}

export function contentToPayload(form: PrepContentForm): Record<string, unknown> {
  return {
    schemaVersion: form.schemaVersion || 1,
    skillId: form.skillId,
    skillName: form.skillName.trim(),
    careerTitle: form.careerTitle.trim(),
    dailyHours: form.dailyHours,
    phase: form.phase,
    estimatedMinutes: form.estimatedMinutes,
    difficulty: form.difficulty,
    completionSummary: form.completionSummary.trim(),
    nextActionTemplate: form.nextActionTemplate.trim(),
    objectives: form.objectives.map((o) => ({
      key: o.key.trim(),
      title: o.title.trim(),
      questionKeys: o.questionKeys.filter(Boolean),
    })),
    lessons: form.lessons.map((l) => ({
      key: l.key.trim(),
      title: l.title.trim(),
      explanation: l.explanation.trim(),
      objectiveKey: l.objectiveKey.trim(),
      questionKeys: l.questionKeys.filter(Boolean),
      examples: l.examples.map((x) => x.trim()).filter(Boolean),
      mistakes: l.mistakes.map((x) => x.trim()).filter(Boolean),
    })),
    questions: form.questions.map((q) => ({
      key: q.key.trim(),
      lessonKey: q.lessonKey.trim(),
      objectiveKey: q.objectiveKey.trim(),
      type: q.type,
      prompt: q.prompt.trim(),
      ...(q.type === "mcq"
        ? { options: q.options.filter((o) => o.label.trim()).map((o) => ({ id: o.id.trim(), label: o.label.trim() })) }
        : {}),
      ...(q.hints.length ? { hints: q.hints.map((h) => h.trim()).filter(Boolean) } : {}),
      ...(q.maxAttempts ? { maxAttempts: q.maxAttempts } : {}),
    })),
    tasks: form.tasks.map((t) => ({
      key: t.key.trim(),
      prompt: t.prompt.trim(),
      required: t.required,
      evidenceKind: t.evidenceKind,
      ...(t.acceptanceCriteria.length
        ? { acceptanceCriteria: t.acceptanceCriteria.map((c) => c.trim()).filter(Boolean) }
        : {}),
    })),
    resources: form.resources
      .filter((r) => r.title.trim() && r.url.trim())
      .map((r) => ({
        title: r.title.trim(),
        url: r.url.trim(),
        kind: r.kind.trim() || "article",
        verified: r.verified,
      })),
    prerequisites: form.prerequisites.filter((p) => p.skillId && p.name),
  };
}

export function rubricToPayload(form: PrepRubricForm): Record<string, unknown> {
  const questions: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(form.questions)) {
    questions[key] = {
      ...(val.correctOptionId ? { correctOptionId: val.correctOptionId } : {}),
      ...(val.modelAnswer ? { modelAnswer: val.modelAnswer } : {}),
      ...(val.keywords.length ? { keywords: val.keywords } : {}),
      ...(val.rubricPoints.length ? { rubricPoints: val.rubricPoints } : {}),
    };
  }
  const tasks: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(form.tasks)) {
    tasks[key] = {
      ...(typeof val.requiresGithub === "boolean" ? { requiresGithub: val.requiresGithub } : {}),
      ...(val.evidenceKind ? { evidenceKind: val.evidenceKind } : {}),
      ...(val.acceptPatterns.length ? { acceptPatterns: val.acceptPatterns } : {}),
      ...(typeof val.minScore === "number" ? { minScore: val.minScore } : {}),
    };
  }
  return { passLine: form.passLine, questions, tasks };
}

export function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function listToLines(items: string[]): string {
  return items.join("\n");
}
