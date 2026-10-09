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
  displayPolicy: "NONE" | "LINK_ONLY" | "SNIPPET";
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
