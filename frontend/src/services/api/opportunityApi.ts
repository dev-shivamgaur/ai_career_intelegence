import type { GovernmentOpportunity, Job } from "@/types";
import { http } from "../http";
import { mapEnum } from "../mappers";

function mapJob(raw: Record<string, unknown>): Job {
  return {
    id: String(raw.id),
    company: String(raw.company),
    role: String(raw.role),
    location: String(raw.location ?? ""),
    workType: mapEnum(String(raw.workType), "hybrid"),
    experience: String(raw.experience ?? ""),
    matchPercent: Number(raw.matchPercent ?? 0),
    matchLabel: mapEnum(String(raw.matchLabel ?? "potential"), "potential"),
    matchedSkills: (raw.matchedSkills as string[]) ?? [],
    missingSkills: (raw.missingSkills as string[]) ?? [],
    whyMatches: String(raw.whyMatches ?? ""),
    priority: mapEnum(String(raw.priority), "medium"),
    isMock: true,
  };
}

export async function getJobs(): Promise<Job[]> {
  const matches = await http.get<Record<string, unknown>[]>("/jobs/matches").catch(() => []);
  if (matches.length) return matches.map(mapJob);
  const rows = await http.get<Record<string, unknown>[]>("/jobs");
  return rows.map(mapJob);
}

export async function getGovernmentOpportunities(): Promise<GovernmentOpportunity[]> {
  const rows = await http.get<Record<string, unknown>[]>("/government-opportunities");
  return rows.map((o) => ({
    id: String(o.id),
    organization: String(o.organization),
    opportunity: String(o.opportunity),
    eligibility: String(o.eligibility ?? ""),
    ageRequirement: String(o.ageRequirement ?? ""),
    educationRequirement: String(o.educationRequirement ?? ""),
    location: String(o.location ?? ""),
    deadline: String(o.deadline ?? ""),
    eligibilityStatus: mapEnum(String(o.eligibilityStatus ?? "needs_verification"), "needs_verification"),
    sourceVerification: mapEnum(String(o.sourceVerification ?? "needs_verification"), "needs_verification") as GovernmentOpportunity["sourceVerification"],
    officialNote: String(o.officialNote ?? ""),
    isMock: true,
  }));
}
