import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as marketApi from "@/services/api/marketAdminApi";
import type { DemandView, SkillTrendLabel, TrendView } from "@/services/api/marketAdminApi";
import { useToast } from "@/store/hooks";
import { useState } from "react";

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function fmt(iso: string | undefined) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function Provenance({ view }: { view: DemandView }) {
  const s = view.snapshot;
  if (!s) return <p className="text-sm text-slate-500">No snapshot yet. Run aggregation after classification has jobs.</p>;
  const p = s.period;
  return (
    <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700">
        <p className="text-xs text-slate-500">Jobs (n) / capped</p>
        <p className="font-semibold">
          {s.n} / {s.cappedN}
        </p>
        <p className="text-xs text-slate-500">company cap {s.capJobs} jobs</p>
      </div>
      <div className="rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700">
        <p className="text-xs text-slate-500">Companies / panel</p>
        <p className="font-semibold">
          {s.companies} / {s.panel.companies} companies · {s.panel.sources} sources
        </p>
      </div>
      <div className="rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700">
        <p className="text-xs text-slate-500">Period · {s.basis}</p>
        <p className="font-semibold">
          {p.type} {new Date(p.start).toLocaleDateString()} – {new Date(p.end).toLocaleDateString()}
        </p>
        <p className="text-xs text-slate-500">{p.complete === false ? "open (replaced until it closes)" : "complete"}</p>
      </div>
      <div className="rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700">
        <p className="text-xs text-slate-500">Confidence</p>
        <p className="font-semibold">Wilson 95% on capped share</p>
        <p className="text-xs text-slate-500">
          {s.methodologyVersion} · {fmt(s.computedAt)}
        </p>
      </div>
    </div>
  );
}

const TREND_TONE: Record<SkillTrendLabel, "success" | "danger" | "warning" | "neutral" | "brand"> = {
  INCREASING: "success",
  DECREASING: "danger",
  EMERGING: "brand",
  STABLE: "neutral",
  INSUFFICIENT_DATA: "warning",
};

function TrendTable({ view }: { view: TrendView }) {
  if (view.coldStart) {
    return (
      <p className="text-sm text-slate-500">
        INSUFFICIENT_DATA until at least {view.methodologyVersion === "trend-1" ? "3 complete" : "enough"} {view.periodType.toLowerCase()} periods exist on a
        stable panel. Frequency (demand share) stays separate from growth.
      </p>
    );
  }
  if (!view.trends.length) return <p className="text-sm text-slate-500">No trend rows for this career and lane yet.</p>;
  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-xs text-slate-500">
        NEW_POSTINGS · {view.methodologyVersion}
        {view.period
          ? ` · ${new Date(view.period.priorStart).toLocaleDateString()} → ${new Date(view.period.start).toLocaleDateString()}`
          : ""}
      </p>
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-500">
          <tr>
            <th className="py-1">Skill</th>
            <th>Label</th>
            <th>Share</th>
            <th>Δ pp</th>
            <th>Adj. p</th>
            <th>n / prior n</th>
            <th>Panel</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
          {view.trends.map((row) => (
            <tr key={row.skillId}>
              <td className="py-1">{row.name}</td>
              <td>
                <Badge tone={TREND_TONE[row.label]}>{row.label}</Badge>
              </td>
              <td>
                {pct(row.priorShare)} → {pct(row.share)}
              </td>
              <td>{(row.effectPp * 100).toFixed(1)}</td>
              <td>{row.adjustedPValue === null ? "—" : row.adjustedPValue.toFixed(3)}</td>
              <td>
                {row.n} / {row.priorN}
              </td>
              <td>
                {row.panel.companies} companies · {row.panel.sources} sources
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkillTable({ view }: { view: DemandView }) {
  if (!view.snapshot) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-500">
          <tr>
            <th className="py-1">Skill</th>
            <th>Jobs</th>
            <th>Capped</th>
            <th>Share</th>
            <th>Wilson 95%</th>
            <th>Companies</th>
            <th>n</th>
            <th>Panel</th>
            <th>Period</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
          {view.skills.map((row) => (
            <tr key={row.skillId}>
              <td className="py-1">
                {row.name}
                <span className="ml-1 text-xs text-slate-500">
                  {row.requiredCount} req · {row.preferredCount} pref · {row.niceCount} mentioned
                </span>
              </td>
              <td>{row.jobCount}</td>
              <td>{row.cappedJobCount}</td>
              <td>{pct(row.demandPct)}</td>
              <td>
                {pct(row.confidence.lower)}–{pct(row.confidence.upper)}
              </td>
              <td>{row.companies}</td>
              <td>{row.n}</td>
              <td>{row.panelCompanies}</td>
              <td className="text-xs text-slate-500">
                {row.period.type} {new Date(row.period.start).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {view.skills.length === 0 && <p className="py-2 text-sm text-slate-500">No resolved skills in this window.</p>}
    </div>
  );
}

export function AdminMarketDemandPage() {
  const { push } = useToast();
  const profiles = useAsyncData(() => marketApi.getCareerProfiles());
  const [careerId, setCareerId] = useState<string>("");
  const [periodType, setPeriodType] = useState<"WEEK" | "MONTH">("MONTH");
  const [basis, setBasis] = useState<"NEW_POSTINGS" | "ACTIVE_STOCK">("ACTIVE_STOCK");
  const [lane, setLane] = useState("all");
  const [periodStart, setPeriodStart] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const careers = profiles.data?.careers ?? [];
  const selected = careerId || careers[0]?.id || "";

  const periods = useAsyncData(
    (signal) => (selected ? marketApi.getDemandPeriods(selected, { periodType, basis, lane }, { signal }) : Promise.resolve([])),
    [selected, periodType, basis, lane],
  );
  const demand = useAsyncData(
    (signal) =>
      selected
        ? marketApi.getDemand(selected, { periodType, basis, lane, periodStart: periodStart || undefined }, { signal })
        : Promise.resolve(null),
    [selected, periodType, basis, lane, periodStart],
  );
  const current = useAsyncData((signal) => (selected ? marketApi.getCurrentDemand(selected, lane, { signal }) : Promise.resolve(null)), [selected, lane]);
  const trends = useAsyncData(
    (signal) => (selected ? marketApi.getTrends(selected, { periodType, lane }, { signal }) : Promise.resolve(null)),
    [selected, periodType, lane],
  );

  const lanes = Array.from(new Set(["all", ...(demand.data?.lanes ?? [])]));

  function refresh() {
    void profiles.reload();
    void periods.reload();
    void demand.reload();
    void current.reload();
    void trends.reload();
  }

  async function aggregate() {
    setBusy(true);
    try {
      const res = await marketApi.startAggregateRun(selected ? [selected] : undefined);
      push(`Aggregation: ${res.taskCount} task(s) queued`);
    } catch (err) {
      push(err instanceof Error ? err.message : "Aggregation failed");
    } finally {
      setBusy(false);
    }
  }

  const error = profiles.error ?? periods.error ?? demand.error ?? current.error ?? trends.error;
  if (error) {
    return (
      <ErrorState
        message={error}
        code={profiles.errorCode ?? periods.errorCode ?? demand.errorCode ?? current.errorCode ?? trends.errorCode}
        onRetry={refresh}
      />
    );
  }

  const view = demand.data;
  const rolling = current.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Market demand"
          description="Period snapshots with a company cap and Wilson confidence. Every figure carries n, companies, panel, period and confidence. The rolling 90-day view is display-only and is never used for trends."
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={refresh}>
                Refresh
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void aggregate()}>
                Aggregate now
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <select
              className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              value={selected}
              onChange={(e) => {
                setCareerId(e.target.value);
                setPeriodStart("");
              }}
            >
              {careers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <select
              className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              value={periodType}
              onChange={(e) => {
                setPeriodType(e.target.value as "WEEK" | "MONTH");
                setPeriodStart("");
              }}
            >
              <option value="MONTH">Month</option>
              <option value="WEEK">ISO week</option>
            </select>
            <select
              className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              value={basis}
              onChange={(e) => {
                setBasis(e.target.value as "NEW_POSTINGS" | "ACTIVE_STOCK");
                setPeriodStart("");
              }}
            >
              <option value="ACTIVE_STOCK">Active stock (display)</option>
              <option value="NEW_POSTINGS">New postings (trends)</option>
            </select>
            <select
              className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              value={lane}
              onChange={(e) => {
                setLane(e.target.value);
                setPeriodStart("");
              }}
            >
              {lanes.map((l) => (
                <option key={l} value={l}>
                  {l === "all" ? "All lanes" : l}
                </option>
              ))}
            </select>
            <select
              className="h-8 min-w-[12rem] rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            >
              <option value="">Latest period</option>
              {(periods.data ?? []).map((p) => (
                <option key={p.periodStart} value={p.periodStart}>
                  {new Date(p.periodStart).toLocaleDateString()} · n={p.totalJobs} · {p.isComplete ? "complete" : "open"}
                </option>
              ))}
            </select>
          </div>
          {view && (
            <>
              <Provenance view={view} />
              <SkillTable view={view} />
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Current demand (rolling active stock)"
          description="Last 90 days of open jobs on the current panel. Labelled as rolling so it is never mixed with trend periods."
        />
        <CardBody className="space-y-3">
          {rolling && (
            <>
              <Provenance view={rolling} />
              {rolling.snapshot && <Badge tone="neutral">display only · not a trend input</Badge>}
              <SkillTable view={rolling} />
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Trends (NEW_POSTINGS)"
          description="Disjoint periods on the intersection panel, company cap, Benjamini–Hochberg across skills of this career/lane, confirmation over consecutive steps. Frequency and growth stay separate."
        />
        <CardBody>{trends.data && <TrendTable view={trends.data} />}</CardBody>
      </Card>
    </div>
  );
}
