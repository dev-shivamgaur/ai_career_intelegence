import { ApiError, http } from "@/services/http";

async function optional<T>(path: string): Promise<T | null> {
  try {
    return await http.get<T>(path);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export type EvidenceRow = {
  id: string;
  skill: string;
  source: string;
  quality: string;
  signal: string | null;
  observedAt: string;
  current: boolean;
};

export type ReadinessView = {
  career: { title: string };
  readiness: { score: number; requiredMet: number; requiredTotal: number; note: string; formula: string };
  marketContext: { n: number | null; companies: number | null; period: { start: string; complete: boolean } | null };
  marketUsedInScore: boolean;
  gaps: Array<{ name: string; type: string; blocked: boolean; demandPct: number | null }>;
};

export type PersonalPlan = {
  plan: { id: string; title: string; tasks: Array<{ id: string; title: string; why: string; foundational: boolean }> } | null;
};

export type GithubLink = { id: string; owner: string; repo: string; url: string; revokedAt: string | null };

export const listEvidence = () => http.get<EvidenceRow[]>("/learner/evidence");
export const listGithub = () => http.get<GithubLink[]>("/learner/github");
export const scanGithub = (url: string) => http.post("/learner/github/scan", { url });
export const disconnectGithub = (id: string) => http.delete(`/learner/github/${id}`);
export const getReadiness = () => optional<ReadinessView>("/learner/readiness");
export const getPersonalPlan = () => optional<PersonalPlan>("/learner/personal-roadmap");
export const generatePersonalPlan = () => http.post<PersonalPlan["plan"]>("/learner/personal-roadmap/generate");
export const applyPersonalPlan = () => http.post("/learner/personal-roadmap/apply");

export type CompanyIntel = {
  disclaimer: string;
  periods: { current: { start: string; end: string }; previous: { start: string; end: string } | null } | null;
  companies: Array<{ companyId: string; name: string; jobs: number; careers: number; skills: number; previousJobs: number | null; jobDelta: number | null }>;
};

export const companyIntel = () => http.get<CompanyIntel>("/admin/learner/companies");
export const learningResources = () => http.get<Array<{ id: string; title: string; url: string; kind: string; skill: { name: string } }>>("/admin/learner/resources");
export const createResource = (body: { skillId: string; title: string; url: string; kind: string }) => http.post("/admin/learner/resources", body);
