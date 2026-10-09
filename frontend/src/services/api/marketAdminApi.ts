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

export function purgeSource(id: string, mode: "policy" | "full") {
  return http.post<{ descriptionsPurged: number; payloadsPurged: number; excerptsCleared: number }>(
    `/admin/market/sources/${id}/purge`,
    { mode },
  );
}
