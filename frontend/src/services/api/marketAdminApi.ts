import { http } from "@/services/http";

export type MarketSourceType = "GREENHOUSE" | "LEVER" | "ASHBY";
export type MarketAllowedUse = "ANALYTICS_AGGREGATE" | "DISPLAY_SNIPPET" | "DISPLAY_LINK_ONLY";
export type RobotsStatus = "ALLOWED" | "DISALLOWED" | "UNKNOWN";

export interface MarketCompany {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  country: string | null;
  notes: string | null;
  active: boolean;
  _count?: { sources: number };
}

export interface MarketSourceRow {
  id: string;
  companyId: string;
  type: MarketSourceType;
  boardToken: string;
  label: string | null;
  enabled: boolean;
  crawlIntervalHours: number;
  termsUrl: string | null;
  termsReviewedAt: string | null;
  termsSummary: string | null;
  allowedUses: MarketAllowedUse[];
  attributionRequired: boolean;
  termsReviewDueAt: string | null;
  displayPolicy: "NONE" | "LINK_ONLY" | "SNIPPET_AND_LINK";
  robotsStatus: RobotsStatus;
  robotsCheckedAt: string | null;
  lastFetchAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  pausedReason: string | null;
  company: { id: string; name: string; slug: string; active: boolean };
  termsProblem: string | null;
  fetchBlocker: string | null;
  effectiveRetention: {
    storeRawPayload: boolean;
    rawPayloadRetentionDays: number;
    descriptionRetentionDays: number;
    evidenceExcerptMaxChars: number;
    displayPolicy: string;
  };
}

export interface TermsReviewInput {
  termsUrl: string;
  termsSummary: string;
  allowedUses: MarketAllowedUse[];
  attributionRequired: boolean;
  reviewDueAt: string;
}

export type TestFetchResult =
  | {
      ok: true;
      fetchedUrl: string;
      robots: RobotsStatus;
      durationMs: number;
      jobCount: number;
      sample: Array<{
        externalId: string;
        title: string;
        location: string | null;
        url: string | null;
        postedAt: string | null;
        descriptionChars: number;
        descriptionPreview: string;
      }>;
    }
  | { ok: false; error: string; message: string; durationMs: number };

export function listCompanies() {
  return http.get<MarketCompany[]>("/admin/market/companies");
}

export function createCompany(input: { name: string; slug: string; website?: string; country?: string }) {
  return http.post<MarketCompany>("/admin/market/companies", input);
}

export function listSources() {
  return http.get<MarketSourceRow[]>("/admin/market/sources");
}

export function createSource(input: { companyId: string; type: MarketSourceType; boardToken: string; label?: string }) {
  return http.post<MarketSourceRow>("/admin/market/sources", input);
}

export function recordTermsReview(id: string, input: TermsReviewInput) {
  return http.post<MarketSourceRow & { termsNarrowed: boolean }>(`/admin/market/sources/${id}/terms-review`, input);
}

export function enableSource(id: string) {
  return http.post(`/admin/market/sources/${id}/enable`, {});
}

export function disableSource(id: string) {
  return http.post(`/admin/market/sources/${id}/disable`, {});
}

export function testFetch(id: string) {
  return http.post<TestFetchResult>(`/admin/market/sources/${id}/test-fetch`, {});
}

export type MarketRunKind = "FETCH" | "PROCESS" | "AGGREGATE" | "RETENTION";
export type MarketRunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "PARTIAL_FAILED" | "FAILED";

export interface MarketRunRow {
  id: string;
  kind: MarketRunKind;
  trigger: "SCHEDULER" | "ADMIN";
  status: MarketRunStatus;
  windowKey: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  counters: Record<string, number> | null;
  createdAt: string;
}

export interface MarketRunDetail extends MarketRunRow {
  tasks: Array<{
    id: string;
    kind: MarketRunKind;
    status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
    attempts: number;
    durationMs: number | null;
    error: string | null;
    counters: Record<string, unknown> | null;
    source: { id: string; type: MarketSourceType; boardToken: string; company: { name: string } } | null;
  }>;
}

export interface MarketHealth {
  flags: { pipeline: boolean; scheduler: boolean; llmExtraction: boolean };
  queueReady: boolean;
  queues: Array<{ queue: string; messages: number; consumers: number }>;
  sources: Array<{
    id: string;
    company: string;
    type: MarketSourceType;
    boardToken: string;
    enabled: boolean;
    pausedReason: string | null;
    termsProblem: string | null;
    fetchBlocker: string | null;
    termsReviewDueAt: string | null;
    robotsStatus: RobotsStatus;
    lastFetchAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    consecutiveFailures: number;
    listing: Record<string, number>;
    processing: Record<string, number>;
    contentPurged: number;
  }>;
}

export function listRuns() {
  return http.get<MarketRunRow[]>("/admin/market/runs");
}

export function getRun(id: string) {
  return http.get<MarketRunDetail>(`/admin/market/runs/${id}`);
}

export function startFetchRun(selection: "due" | "all") {
  return http.post<{ runId: string; taskCount: number }>("/admin/market/runs/fetch", { selection });
}

export function startRetentionRun() {
  return http.post<{ runId: string; taskCount: number }>("/admin/market/runs/retention", {});
}

export function getHealth() {
  return http.get<MarketHealth>("/admin/market/health");
}

export interface SliceSummary {
  basis: "ACTIVE_STOCK";
  asOf: string;
  openJobs: number;
  classification: { classified: number; unclassified: number; pending: number };
  careers: Array<{ careerId: string; title: string; slug: string | null; jobCount: number; companyCount: number }>;
  quality: {
    skillRows: number;
    unresolvedSkillRows: number;
    unresolvedSkillRate: number | null;
    unresolvedNames: number;
    pendingCandidates: number;
    rawJobsLinked: number;
    marketJobs: number;
    mergedJobs: number;
    mergeRate: number | null;
    unclassifiedRate: number | null;
    processing: Record<string, number>;
    failedRows: number;
    purgedDescriptions: number;
  };
  fetchRuns: Array<{ id: string; trigger: string; status: MarketRunStatus; startedAt: string | null; finishedAt: string | null }>;
  consecutiveCleanFetchRuns: number;
}

export interface SliceSkill {
  key: string;
  skillId: string | null;
  name: string;
  resolved: boolean;
  jobCount: number;
  requiredCount: number;
  preferredCount: number;
  niceCount: number;
  companyCount: number;
}

export interface SliceCareerSkills {
  basis: "ACTIVE_STOCK";
  career: { id: string; title: string; slug: string };
  jobCount: number;
  companyCount: number;
  skills: SliceSkill[];
}

export interface SliceSkillJobs {
  jobs: Array<{
    id: string;
    title: string;
    locationText: string | null;
    seniority: string | null;
    firstSeenAt: string;
    sourceCount: number;
    company: { id: string; name: string };
    careers: Array<{ method: string; matchedPattern: string | null; confidence: number }>;
    skills: Array<{
      rawName: string;
      level: "REQUIRED" | "RECOMMENDED" | "NICE_TO_HAVE";
      confidence: number;
      method: "RULE" | "LLM" | "RULE_LLM";
      evidence: string | null;
      evidenceStart: number | null;
      evidenceEnd: number | null;
      yearsRequired: number | null;
      extractorVersion: string;
      rawJob: {
        id: string;
        externalId: string;
        url: string | null;
        contentPurgedAt: string | null;
        source: { id: string; type: MarketSourceType; boardToken: string };
      };
    }>;
  }>;
}

export interface CareerMarketProfile {
  id: string;
  title: string;
  slug: string;
  profile: { titlePatterns: string[]; excludePatterns: string[]; enabled: boolean; updatedAt: string } | null;
  suggested: { titlePatterns: string[]; excludePatterns: string[] } | null;
  openJobs: number;
}

export interface SkillCandidateRow {
  id: string;
  name: string;
  normalizedName: string;
  status: "PENDING" | "APPROVED" | "MAPPED" | "REJECTED" | "MERGED";
  jobCount: number;
  companyCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  suggestedSkill: { id: string; name: string } | null;
  resolvedSkill: { id: string; name: string } | null;
  suggestionMethod: string | null;
  suggestionScore: number | null;
  autoApproved: boolean;
  note: string | null;
}

export function getSlice() {
  return http.get<SliceSummary>("/admin/market/slice");
}

export function getSliceCareerSkills(careerId: string) {
  return http.get<SliceCareerSkills>(`/admin/market/slice/careers/${careerId}/skills`);
}

export function getSliceSkillJobs(careerId: string, key: string) {
  return http.get<SliceSkillJobs>(`/admin/market/slice/careers/${careerId}/skills/${encodeURIComponent(key)}/jobs`);
}

export function getCareerProfiles() {
  return http.get<{ careers: CareerMarketProfile[]; unclassifiedSample: Array<{ id: string; title: string; normalizedTitle: string; company: { name: string } }> }>(
    "/admin/market/careers",
  );
}

export function saveCareerProfile(careerId: string, input: { titlePatterns: string[]; excludePatterns: string[]; enabled: boolean }) {
  return http.put(`/admin/market/careers/${careerId}/profile`, input);
}

export function startReclassifyRun() {
  return http.post<{ runId: string | null; taskCount: number }>("/admin/market/runs/reclassify", {});
}

export function listCandidates(status = "PENDING") {
  return http.get<{ total: number; counts: Record<string, number>; items: SkillCandidateRow[] }>(
    `/admin/market/candidates?status=${encodeURIComponent(status)}&take=100`,
  );
}

export interface SkillMergePlan {
  source: { id: string; name: string };
  target: { id: string; name: string };
  moves: Record<string, number>;
  conflicts: Record<string, number>;
  aliasAdded: boolean;
  executed: boolean;
}

export interface SkillAliasRow {
  id: string;
  alias: string;
  normalizedAlias: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  source: string;
  skill: { id: string; name: string };
}

export interface SkillReviewLogRow {
  id: string;
  action: string;
  candidateId: string | null;
  skillId: string | null;
  targetSkillId: string | null;
  actorId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export function suggestCandidates(limit = 25) {
  return http.post<{ processed: number; suggested: number; autoMapped: number; skipped?: string }>("/admin/market/candidates/suggest", { limit });
}

export function mapCandidate(id: string, skillId: string) {
  return http.post<{ relinked: number }>(`/admin/market/candidates/${id}/map`, { skillId });
}

export function approveCandidate(id: string, input: { name?: string; category?: string }) {
  return http.post<{ relinked: number; skill: { id: string; name: string } }>(`/admin/market/candidates/${id}/approve`, input);
}

export function rejectCandidate(id: string, note?: string) {
  return http.post<{ rowsRemoved: number }>(`/admin/market/candidates/${id}/reject`, { note });
}

export function reopenCandidate(id: string) {
  return http.post(`/admin/market/candidates/${id}/reopen`, {});
}

export function listAliases(q?: string) {
  return http.get<SkillAliasRow[]>(`/admin/market/aliases${q ? `?q=${encodeURIComponent(q)}` : ""}`);
}

export function addAlias(skillId: string, alias: string) {
  return http.post<{ relinked: number; candidatesMapped: number }>("/admin/market/aliases", { skillId, alias });
}

export function disableAlias(id: string) {
  return http.post(`/admin/market/aliases/${id}/disable`, {});
}

export function listDuplicateSkills() {
  return http.get<Array<{ key: string; skills: Array<{ id: string; name: string; category: string; createdAt: string }> }>>(
    "/admin/market/skills/duplicates",
  );
}

export function mergeSkills(sourceSkillId: string, targetSkillId: string, execute: boolean) {
  return http.post<SkillMergePlan>("/admin/market/skills/merge", { sourceSkillId, targetSkillId, execute });
}

export function listReviewLog() {
  return http.get<SkillReviewLogRow[]>("/admin/market/review-log");
}

export function purgeSource(id: string, mode: "policy" | "full") {
  return http.post<{ descriptionsPurged: number; payloadsPurged: number; excerptsCleared: number }>(
    `/admin/market/sources/${id}/purge`,
    { mode },
  );
}
