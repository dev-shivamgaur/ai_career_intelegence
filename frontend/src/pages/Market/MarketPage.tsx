import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useProfile } from "@/context/ProfileContext";
import * as marketApi from "@/services/api/marketApi";
import type { CompareSkill } from "@/services/api/marketAdminApi";

const enabled = import.meta.env.VITE_MARKET_UI === "true";

function pct(v: number | null) {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}

function Column({
  title,
  blurb,
  rows,
}: {
  title: string;
  blurb: string;
  rows: CompareSkill[];
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-950">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
        {title} <span className="font-normal text-slate-500">({rows.length})</span>
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{blurb}</p>
      <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
        {rows.map((row) => (
          <li key={row.skillId} className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800">
            <span className="font-medium">{row.name}</span>
            <span className="text-xs text-slate-500">{pct(row.demandPct)} of jobs</span>
            {row.trend && row.trend !== "STABLE" ? (
              <Badge tone={row.trend === "EMERGING" ? "brand" : "neutral"}>{row.trend}</Badge>
            ) : null}
          </li>
        ))}
        {rows.length === 0 && <li className="text-slate-500">Nothing in this set yet.</li>}
      </ul>
    </div>
  );
}

export function MarketPage() {
  const profile = useProfile();
  const slug = profile.data?.careerGoal.slug ?? "";
  const compare = useAsyncData(
    (signal) => (enabled && slug ? marketApi.getRoadmapVsMarket(slug, "all", { signal }) : Promise.resolve(null)),
    [slug],
  );
  const demand = useAsyncData(
    (signal) => (enabled && slug ? marketApi.getCareerDemand(slug, "all", { signal }) : Promise.resolve(null)),
    [slug],
  );
  const trends = useAsyncData(
    (signal) => (enabled && slug ? marketApi.getCareerTrends(slug, "all", { signal }) : Promise.resolve(null)),
    [slug],
  );

  if (!enabled) {
    return (
      <Card>
        <CardHeader
          title="Market insights"
          description="This page stays off until MARKET_UI and VITE_MARKET_UI are turned on."
        />
      </Card>
    );
  }
  if (!slug) {
    return (
      <Card>
        <CardHeader
          title="Market insights"
          description="Choose a career on Settings or Profile first. Market numbers are always for that role only."
        />
      </Card>
    );
  }
  const error = compare.error ?? demand.error ?? trends.error;
  if (error) return <ErrorState message={error} onRetry={() => void compare.reload()} />;
  const sets = compare.data?.sets;
  const snap = demand.data?.snapshot;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Market insights"
          description={`How your ${profile.data?.careerGoal.title ?? "career"} roadmap lines up with skills employers list in recent job posts.`}
        />
        <CardBody className="space-y-4 text-sm">
          <div className="rounded-xl bg-slate-50 p-4 leading-relaxed text-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <p className="font-medium text-slate-900 dark:text-slate-50">How to read this page</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs sm:text-sm">
              <li>
                <strong>Overlap</strong> — on your learning plan and also common in hiring.
              </li>
              <li>
                <strong>Roadmap only</strong> — we still want you to learn it, even if market share is lower.
              </li>
              <li>
                <strong>Market only</strong> — showing up in jobs but not yet on your plan (review with care).
              </li>
              <li>Trend labels need about three complete months of data; until then you may see cold start.</li>
            </ul>
          </div>

          {snap && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <p className="text-xs text-slate-500">Jobs in sample</p>
                <p className="text-lg font-semibold">{snap.n}</p>
              </div>
              <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <p className="text-xs text-slate-500">Companies</p>
                <p className="text-lg font-semibold">{snap.companies}</p>
              </div>
              <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <p className="text-xs text-slate-500">Panel companies</p>
                <p className="text-lg font-semibold">{snap.panel.companies}</p>
              </div>
            </div>
          )}
          {snap && (
            <p className="text-xs text-slate-500">
              Basis {snap.basis} · methodology {snap.methodologyVersion}
            </p>
          )}
          {trends.data?.coldStart && <Badge tone="warning">Trends: not enough history yet (cold start)</Badge>}

          {sets && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Column
                title="On the roadmap and in the market"
                blurb="Prioritize these — they appear in both your plan and hiring demand."
                rows={sets.overlap}
              />
              <Column
                title="Roadmap only"
                blurb="Keep learning these for the role syllabus, even if fewer postings list them."
                rows={sets.roadmapOnly}
              />
              <Column
                title="Market only"
                blurb="Employers mention these; decide with your mentor whether to add them."
                rows={sets.marketOnly}
              />
            </div>
          )}
          {sets && (sets.emerging.length > 0 || sets.mismatch.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Column
                title="Emerging"
                blurb="Rising in recent windows. Watch these for next-quarter planning."
                rows={sets.emerging}
              />
              <Column
                title="Importance mismatch"
                blurb="Roadmap importance and market frequency disagree — double-check priority."
                rows={sets.mismatch}
              />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
