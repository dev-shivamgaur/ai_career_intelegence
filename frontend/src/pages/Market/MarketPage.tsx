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

function Column({ title, rows }: { title: string; rows: CompareSkill[] }) {
  return (
    <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
      <p className="mb-2 text-sm font-medium">
        {title} <span className="text-slate-500">({rows.length})</span>
      </p>
      <ul className="space-y-1 text-sm">
        {rows.map((row) => (
          <li key={row.skillId}>
            {row.name} <span className="text-xs text-slate-500">{pct(row.demandPct)}</span>
            {row.trend && row.trend !== "STABLE" ? <Badge tone={row.trend === "EMERGING" ? "brand" : "neutral"}>{row.trend}</Badge> : null}
          </li>
        ))}
        {rows.length === 0 && <li className="text-slate-500">None</li>}
      </ul>
    </div>
  );
}

export function MarketPage() {
  const profile = useProfile();
  const slug = profile.data?.careerGoal.slug ?? "";
  const compare = useAsyncData((signal) => (enabled && slug ? marketApi.getRoadmapVsMarket(slug, "all", { signal }) : Promise.resolve(null)), [slug]);
  const demand = useAsyncData((signal) => (enabled && slug ? marketApi.getCareerDemand(slug, "all", { signal }) : Promise.resolve(null)), [slug]);
  const trends = useAsyncData((signal) => (enabled && slug ? marketApi.getCareerTrends(slug, "all", { signal }) : Promise.resolve(null)), [slug]);

  if (!enabled) {
    return (
      <Card>
        <CardHeader title="Market insights" description="This page stays off until MARKET_UI and VITE_MARKET_UI are turned on." />
      </Card>
    );
  }
  if (!slug) {
    return (
      <Card>
        <CardHeader title="Market insights" description="Choose a career first. Market figures are for that career only." />
      </Card>
    );
  }
  const error = compare.error ?? demand.error ?? trends.error;
  if (error) return <ErrorState message={error} onRetry={() => void compare.reload()} />;
  const sets = compare.data?.sets;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Market insights"
          description="Active-stock demand for your career, beside the roadmap. Trend labels stay INSUFFICIENT_DATA until three complete months exist. Counts include jobs, companies and the period."
        />
        <CardBody className="space-y-3 text-sm">
          {demand.data?.snapshot && (
            <p className="text-slate-500">
              n={demand.data.snapshot.n} · {demand.data.snapshot.companies} companies · panel {demand.data.snapshot.panel.companies} ·{" "}
              {demand.data.snapshot.basis} · {demand.data.snapshot.methodologyVersion}
            </p>
          )}
          {trends.data?.coldStart && <Badge tone="warning">Trends: INSUFFICIENT_DATA (cold start)</Badge>}
          {sets && (
            <div className="grid gap-3 lg:grid-cols-3">
              <Column title="On the roadmap and in the market" rows={sets.overlap} />
              <Column title="Roadmap only" rows={sets.roadmapOnly} />
              <Column title="Market only" rows={sets.marketOnly} />
            </div>
          )}
          {sets && (sets.emerging.length > 0 || sets.mismatch.length > 0) && (
            <div className="grid gap-3 lg:grid-cols-2">
              <Column title="Emerging" rows={sets.emerging} />
              <Column title="Importance mismatch" rows={sets.mismatch} />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
