import type { ResearchReport, ResearchSource, ResearchTimelineEvent } from "@/types";
import { http } from "../http";
import { mapEnum } from "../mappers";

function mapReport(raw: Record<string, unknown> | null): ResearchReport {
  if (!raw) {
    return {
      status: "idle",
      sourcesAnalyzed: 0,
      jobDescriptions: 0,
      learningResources: 0,
      governmentSources: 0,
      skillPatterns: 0,
      verificationStatus: "pending",
      sources: [],
      timeline: [],
      summary: "",
      findings: [],
    };
  }
  const sources = ((raw.sources as Array<Record<string, unknown>>) ?? []).map(
    (s): ResearchSource => ({
      id: String(s.id),
      title: String(s.title),
      type: mapEnum(String(s.type), "job"),
      domain: String(s.domain ?? ""),
      quality: mapEnum(String(s.quality), "unverified"),
      keyFinding: String(s.keyFinding ?? ""),
      usedInRecommendation: Boolean(s.usedInRecommendation),
      confidence: Number(s.confidence ?? 0),
    }),
  );
  const timeline = ((raw.timeline as Array<Record<string, unknown>>) ?? []).map(
    (t): ResearchTimelineEvent => ({
      id: String(t.id),
      label: String(t.label),
      timestamp: String(t.timestamp ?? new Date().toISOString()),
      status: t.status === "skipped" ? "skipped" : "done",
    }),
  );
  return {
    status: mapEnum(String(raw.status), "completed") as ResearchReport["status"],
    sourcesAnalyzed: Number(raw.sourcesAnalyzed ?? sources.length),
    jobDescriptions: Number(raw.jobDescriptions ?? 0),
    learningResources: Number(raw.learningResources ?? 0),
    governmentSources: Number(raw.governmentSources ?? 0),
    skillPatterns: Number(raw.skillPatterns ?? 0),
    verificationStatus: mapEnum(String(raw.verificationStatus), "completed") as ResearchReport["verificationStatus"],
    sources,
    timeline,
    summary: String(raw.summary ?? ""),
    query: raw.query ? String(raw.query) : undefined,
    findings: ((raw.findings as Array<Record<string, unknown>>) ?? []).map((f) => ({
      id: String(f.id ?? f.title),
      title: String(f.title ?? "Finding"),
      content: String(f.content ?? ""),
      tags: Array.isArray(f.tags) ? f.tags.map(String) : [],
    })),
  };
}

export async function getResearchReport(): Promise<ResearchReport> {
  const raw = await http.get<Record<string, unknown> | null>("/research");
  if (!raw || typeof raw !== "object" || !("id" in raw || "status" in raw || "summary" in raw)) {
    return mapReport(null);
  }
  return mapReport(raw);
}

export async function rerunResearch(): Promise<ResearchReport> {
  const raw = await http.post<Record<string, unknown>>("/research", {});
  return mapReport(raw);
}
