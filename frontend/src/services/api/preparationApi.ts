import { http } from "@/services/http";

export interface PrepQuestion {
  key: string;
  lessonKey: string;
  objectiveKey: string;
  type: "mcq" | "short" | "sql" | "code" | "practical" | "scenario" | "theory";
  prompt: string;
  options?: Array<{ id: string; label: string }>;
  hints?: string[];
}

export interface PrepPackageView {
  schemaVersion?: number;
  skillId: string;
  skillName: string;
  careerTitle: string;
  dailyHours: number | null;
  phase: string | null;
  subtopics?: Array<{ key: string; title: string; order: number; objectiveKeys: string[] }>;
  objectives: Array<{ key: string; title: string; questionKeys: string[] }>;
  prerequisites: Array<{ skillId: string; name: string }>;
  estimatedMinutes: number;
  difficulty: string;
  lessons: Array<{
    key: string;
    title: string;
    explanation: string;
    objectiveKey: string;
    subtopicKey?: string;
    questionKeys: string[];
    examples: string[];
    mistakes: string[];
    diagrams?: Array<{ kind: string; body: string }>;
    codeBlocks?: Array<{ language: string; code: string; caption?: string }>;
  }>;
  resources: Array<{ title: string; url: string; kind: string; verified: boolean }>;
  questions: PrepQuestion[];
  tasks: Array<{
    key: string;
    prompt: string;
    required: boolean;
    evidenceKind?: string;
    acceptanceCriteria?: string[];
  }>;
  completionSummary: string;
  nextActionTemplate: string;
}

export interface PrepProgress {
  status: "IN_PROGRESS" | "NEEDS_PRACTICE" | "VERIFIED";
  questionsAnswered: number;
  questionsCorrect: number;
  lessonCompleted: number;
  lessonTotal: number;
  assessmentScore: number | null;
  objectives: Array<{ key: string; title: string; proficiency: number; passed: boolean }>;
  practicalVerified: number;
  practicalRequired: number;
  weakConcepts: string[];
  nextAction: string;
}

export interface PrepVersionInfo {
  current: number;
  latest: number;
  packageId: string;
  latestPackageId: string;
  upgradeAvailable: boolean;
}

export interface PrepCurrent {
  session: {
    id: string;
    skillId: string;
    skillName: string;
    status: string;
    roadmapTaskId: string | null;
    packageId?: string;
    packageVersion: number;
    resumeState: { lessonKey?: string; questionKey?: string } | null;
    dailyHours: number | null;
  };
  package: PrepPackageView;
  progress: PrepProgress;
  versionInfo?: PrepVersionInfo;
  lessons: Array<{ lessonKey: string; status: string; completedAt: string | null }>;
  latest: Array<{ questionKey: string; score: number; passed: boolean; feedback: string; answer: string; attemptNumber: number }>;
}

export interface PrepPackageList {
  skillId: string;
  skillName: string;
  versions: Array<{
    packageId: string;
    version: number;
    publishedAt: string | null;
    difficulty: string;
    estimatedMinutes: number;
    lessonCount: number;
  }>;
  latestVersion: number | null;
  latestPackageId: string | null;
  mySessions: Array<{
    sessionId: string;
    packageId: string;
    version: number;
    status: string;
    updatedAt: string;
  }>;
}

export interface PrepHistory {
  attempts: Array<{
    questionKey: string;
    attemptNumber: number;
    answer: string;
    score: number;
    passed: boolean;
    feedback: string;
    createdAt: string;
  }>;
  tasks: Array<{ taskKey: string; verified: boolean; score: number; feedback: string; createdAt: string }>;
}

export function listPrepPackages(skillId: string) {
  return http.get<PrepPackageList>(`/preparation/packages?skillId=${encodeURIComponent(skillId)}`);
}

export function startPreparation(body: {
  skillId?: string;
  roadmapTaskId?: string;
  generate?: boolean;
  packageId?: string;
  packageVersion?: number;
  switchVersion?: boolean;
}) {
  return http.post<PrepCurrent>("/preparation/sessions", body);
}

export function currentPreparation(skillId: string) {
  return http.get<PrepCurrent>(`/preparation/sessions/current?skillId=${encodeURIComponent(skillId)}`);
}

export function preparationHistory(sessionId: string) {
  return http.get<PrepHistory>(`/preparation/sessions/${sessionId}/history`);
}

export function submitAttempt(sessionId: string, body: { questionKey: string; answer: string; idempotencyKey: string }) {
  return http.post<{ attempt: { score: number; passed: boolean; feedback: string }; progress: PrepProgress; duplicate: boolean }>(
    `/preparation/sessions/${sessionId}/attempts`,
    body,
  );
}

export function completeLesson(sessionId: string, lessonKey: string) {
  return http.post<PrepCurrent>(`/preparation/sessions/${sessionId}/lessons/${encodeURIComponent(lessonKey)}/complete`, {});
}

export function submitTask(sessionId: string, body: { taskKey: string; evidence: string }) {
  return http.post<{ verified: boolean; feedback: string; progress: PrepProgress }>(`/preparation/sessions/${sessionId}/tasks`, body);
}

export function requestHint(sessionId: string, questionKey: string) {
  return http.post<{ hint: string }>(`/preparation/sessions/${sessionId}/hint`, { questionKey }, { timeoutMs: 90_000 });
}

export function applyPreparation(sessionId: string) {
  return http.post<{ applied: boolean; roadmapTasksCompleted: number; status: string }>(`/preparation/sessions/${sessionId}/apply`, {});
}

export function preparationUsage() {
  return http.get<{ plan: string; generates: { used: number; limit: number }; grades: { used: number; limit: number } }>(
    "/preparation/usage",
  );
}
