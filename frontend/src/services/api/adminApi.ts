import { http } from "@/services/http";
import type { UserRole } from "@/types";

export interface AdminStats {
  users: { total: number; admins: number; withProfile: number };
  goals: { active: number; analysed: number; pendingAnalysis: number; skillGapRows: number };
  catalog: {
    careers: number;
    skills: number;
    jobs: number;
    governmentExams: number;
    governmentOpportunities: number;
  };
  documents: number;
}

export interface AdminUserRow {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: "USER" | "ADMIN";
  isDemo: boolean;
  onboardingComplete: boolean;
  createdAt: string;
  profile: { completionPercent: number; careerTrack: string } | null;
  _count: { documents: number; careerGoals: number; skillGaps: number };
}

export interface AdminUserList {
  total: number;
  skip: number;
  take: number;
  items: AdminUserRow[];
}

export interface AdminSkill {
  id: string;
  name: string;
  category: string;
}

export interface AdminCareer {
  id: string;
  title: string;
  slug: string;
  overview: string;
  marketExpectations: string;
  entryLevelExpectations: string;
  requirements: Array<{
    id: string;
    importance: "HIGH" | "MEDIUM" | "LOW";
    type: "REQUIRED" | "RECOMMENDED" | "NICE_TO_HAVE";
    skill: AdminSkill;
  }>;
  _count?: { goals: number };
}

export function getStats() {
  return http.get<AdminStats>("/admin/stats");
}

export function listUsers(params: { search?: string; skip?: number; take?: number } = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.skip !== undefined) query.set("skip", String(params.skip));
  if (params.take !== undefined) query.set("take", String(params.take));
  const suffix = query.toString() ? `?${query}` : "";
  return http.get<AdminUserList>(`/admin/users${suffix}`);
}

export function setUserRole(id: string, role: UserRole) {
  return http.patch(`/admin/users/${id}/role`, { role: role.toUpperCase() });
}

export function deleteUser(id: string) {
  return http.delete(`/admin/users/${id}`);
}

export function listCareers() {
  return http.get<AdminCareer[]>("/admin/careers");
}

export interface CareerRequirementInput {
  skillName: string;
  skillCategory?: string;
  importance?: "HIGH" | "MEDIUM" | "LOW";
  type?: "REQUIRED" | "RECOMMENDED" | "NICE_TO_HAVE";
}

export interface CareerInput {
  title: string;
  slug: string;
  overview: string;
  marketExpectations: string;
  entryLevelExpectations: string;
  requirements?: CareerRequirementInput[];
}

export function createCareer(input: CareerInput) {
  return http.post<AdminCareer>("/admin/careers", input);
}

export function updateCareer(id: string, input: Partial<CareerInput>) {
  return http.patch<AdminCareer>(`/admin/careers/${id}`, input);
}

export function replaceRequirements(id: string, requirements: CareerRequirementInput[]) {
  return http.put<AdminCareer>(`/admin/careers/${id}/requirements`, { requirements });
}

export function deleteCareer(id: string) {
  return http.delete(`/admin/careers/${id}`);
}

export interface IngestQueued {
  runId: string | null;
  jobId: string | null;
  jobCount: number;
  status: "queued" | "skipped";
  note?: string;
}

export function refreshCareerTopics(id: string) {
  return http.post<IngestQueued>(`/admin/careers/${id}/refresh-topics`, {});
}

export type IngestRunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "PARTIAL_FAILED" | "FAILED";
export type IngestJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export interface IngestRunRow {
  id: string;
  trigger: "SCHEDULER" | "ADMIN" | "CREATE";
  status: IngestRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  createdAt: string;
}

export interface IngestJobStepRow {
  id: string;
  stepKey: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface IngestRunDetail extends IngestRunRow {
  jobs: Array<{
    id: string;
    status: IngestJobStatus;
    error: string | null;
    durationMs: number | null;
    result: { added?: string[]; usersUpdated?: number; note?: string } | null;
    career: { id: string; slug: string; title: string };
    steps: IngestJobStepRow[];
  }>;
}

export function listIngestRuns() {
  return http.get<IngestRunRow[]>("/admin/ingest/runs");
}

export function getIngestRun(runId: string) {
  return http.get<IngestRunDetail>(`/admin/ingest/runs/${runId}`);
}

export interface LaneSkill {
  id: string;
  skillId: string;
  name: string;
  category: string;
  importance: string;
  type: string;
  layer: string;
}

export interface CareerLane {
  id: string;
  label: string;
  skills: LaneSkill[];
}

export interface CareerLanes {
  careerId: string;
  title: string;
  slug: string;
  lanes: CareerLane[];
}

export function listLanes(careerId: string) {
  return http.get<CareerLanes>(`/admin/careers/${careerId}/lanes`);
}

export function replaceLaneSkills(careerId: string, laneId: string, skills: string[]) {
  return http.put<CareerLanes>(`/admin/careers/${careerId}/lanes/${encodeURIComponent(laneId)}/skills`, { skills });
}

export function updateRequirement(id: string, input: { skillName?: string; importance?: string; type?: string; layer?: string }) {
  return http.patch(`/admin/requirements/${id}`, input);
}

export function deleteRequirement(id: string) {
  return http.delete(`/admin/requirements/${id}`);
}

export interface UserKnowledge {
  id: string;
  phone: string;
  name: string | null;
  primaryStack: string | null;
  career: { id: string; title: string; slug: string } | null;
  knownSkills: Array<{ skillId: string; name: string; category: string; proficiency: number }>;
  skillGaps: Array<{ id: string; skill: string; category: string; currentStatus: string; priority: string; required: boolean }>;
}

export function getUserKnowledge(id: string) {
  return http.get<UserKnowledge>(`/admin/users/${id}/knowledge`);
}

export interface UserProgress {
  career: { id: string; title: string; slug: string; estimatedMatch: number | null; lastAnalyzedAt: string | null } | null;
  skillGapCount: number;
  roadmap: {
    id: string;
    title: string;
    careerTitle: string;
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    skipped: number;
  } | null;
}

export function getUserProgress(id: string) {
  return http.get<UserProgress>(`/admin/users/${id}/progress`);
}

export function updateUserProfile(
  id: string,
  input: {
    name?: string;
    location?: string;
    primaryStack?: string;
    prepGoalText?: string;
    careerTrack?: string;
    educationLevel?: string;
  },
) {
  return http.patch<UserKnowledge>(`/admin/users/${id}/profile`, input);
}

export function addUserSkill(id: string, input: { name: string; category?: string; proficiency?: number }) {
  return http.post<UserKnowledge>(`/admin/users/${id}/skills`, input);
}

export function updateUserSkill(id: string, skillId: string, proficiency: number) {
  return http.patch<UserKnowledge>(`/admin/users/${id}/skills/${skillId}`, { proficiency });
}

export function deleteUserSkill(id: string, skillId: string) {
  return http.delete<UserKnowledge>(`/admin/users/${id}/skills/${skillId}`);
}

export function updateSkill(id: string, input: { name?: string; category?: string }) {
  return http.patch<AdminSkill>(`/admin/skills/${id}`, input);
}

export function listJobs() {
  return http.get<Array<Record<string, unknown>>>("/admin/jobs");
}

export function createJob(input: { company: string; role: string; location?: string; description?: string }) {
  return http.post("/admin/jobs", input);
}

export function deleteJob(id: string) {
  return http.delete(`/admin/jobs/${id}`);
}

export function listExams() {
  return http.get<Array<Record<string, unknown>>>("/admin/government-exams");
}

export function deleteExam(id: string) {
  return http.delete(`/admin/government-exams/${id}`);
}

export function listOpportunities() {
  return http.get<Array<Record<string, unknown>>>("/admin/government-opportunities");
}

export function createOpportunity(input: { organization: string; opportunity: string; eligibility: string; location?: string }) {
  return http.post("/admin/government-opportunities", input);
}

export function deleteOpportunity(id: string) {
  return http.delete(`/admin/government-opportunities/${id}`);
}

export function listSkills() {
  return http.get<AdminSkill[]>("/admin/skills");
}

export function createSkill(input: { name: string; category: string }) {
  return http.post<AdminSkill>("/admin/skills", input);
}

export function deleteSkill(id: string) {
  return http.delete(`/admin/skills/${id}`);
}
