import type { WhyExplanation } from "@/types";
import { EvidenceChip } from "./StatusBadge";

export function WhyPanel({ why }: { why: WhyExplanation }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium text-slate-900 dark:text-white">{why.recommendation}</p>
      <dl className="space-y-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Current profile</dt>
          <dd>{why.currentProfile}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Target career</dt>
          <dd>{why.targetCareer}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Market evidence</dt>
          <dd>{why.marketEvidence}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Learn</dt>
          <dd>{why.reason}</dd>
        </div>
        {why.practice && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Practice</dt>
            <dd>{why.practice}</dd>
          </div>
        )}
        {why.example && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Example</dt>
            <dd>{why.example}</dd>
          </div>
        )}
        {why.solution && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Do this next</dt>
            <dd>{why.solution}</dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        <EvidenceChip kind="analysis" />
        <EvidenceChip kind="estimate" />
        <EvidenceChip kind="mock" />
      </div>
    </div>
  );
}
