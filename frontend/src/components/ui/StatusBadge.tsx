import { Badge } from "./Badge";
import type { EligibilityStatus, JobMatchLabel, SkillStatus, SourceQuality, TaskStatus } from "@/types";

export function StatusBadge({
  status,
}: {
  status: SkillStatus | TaskStatus | JobMatchLabel | EligibilityStatus | SourceQuality | string;
}) {
  const map: Record<string, { tone: "success" | "warning" | "danger" | "neutral" | "brand" | "info"; label: string }> = {
    strong: { tone: "success", label: "Strong" },
    good: { tone: "brand", label: "Good" },
    needs_improvement: { tone: "warning", label: "Needs Improvement" },
    missing: { tone: "danger", label: "Missing" },
    not_started: { tone: "neutral", label: "Not started" },
    in_progress: { tone: "info", label: "In progress" },
    completed: { tone: "success", label: "Completed" },
    skipped: { tone: "neutral", label: "Skipped" },
    potential: { tone: "warning", label: "Potential Match" },
    low: { tone: "neutral", label: "Low Match" },
    eligible: { tone: "success", label: "Eligible" },
    possibly_eligible: { tone: "warning", label: "Possibly Eligible" },
    not_eligible: { tone: "danger", label: "Not Eligible" },
    needs_verification: { tone: "info", label: "Needs Verification" },
    official: { tone: "success", label: "Official" },
    trusted: { tone: "brand", label: "Trusted" },
    established: { tone: "info", label: "Established" },
    community: { tone: "neutral", label: "Community" },
    unverified: { tone: "warning", label: "Unverified" },
    high: { tone: "danger", label: "High priority" },
    medium: { tone: "warning", label: "Medium priority" },
  };
  const item = map[status] ?? { tone: "neutral" as const, label: String(status) };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}

export function SkillBadge({ name, ai }: { name: string; ai?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
      {name}
      {ai && <span className="text-[10px] uppercase tracking-wide text-violet-600">AI detected</span>}
    </span>
  );
}

export function EvidenceChip({ kind }: { kind: string }) {
  const labels: Record<string, string> = {
    profile: "User-provided",
    document: "AI detected",
    market: "Market evidence",
    research: "Research",
    estimate: "Platform estimate",
    mock: "Mock data",
    analysis: "AI Analysis",
    verified: "Verified source",
  };
  return <Badge tone="info">{labels[kind] ?? kind}</Badge>;
}
