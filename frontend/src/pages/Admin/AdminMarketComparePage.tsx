import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as marketApi from "@/services/api/marketAdminApi";
import type { CompareSkill } from "@/services/api/marketAdminApi";
import { useToast } from "@/store/hooks";
import { useState } from "react";

function pct(v: number | null) {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}

function List({ title, rows, onPromote }: { title: string; rows: CompareSkill[]; onPromote?: (skillId: string) => void }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{title}</p>
      <ul className="space-y-1 text-sm">
        {rows.map((row) => (
          <li key={row.skillId} className="flex flex-wrap items-center gap-2">
            <span>{row.name}</span>
            <span className="text-xs text-slate-500">
              {pct(row.demandPct)}
              {row.n !== null ? ` · n=${row.n}` : ""}
              {row.companies !== null ? ` · ${row.companies} companies` : ""}
              {row.roadmapType ? ` · roadmap ${row.roadmapType}` : ""}
            </span>
            {row.trend && <Badge tone="neutral">{row.trend}</Badge>}
            {onPromote && (
              <Button size="sm" variant="outline" onClick={() => onPromote(row.skillId)}>
                Promote to requirement
              </Button>
            )}
          </li>
        ))}
        {rows.length === 0 && <li className="text-slate-500">None</li>}
      </ul>
    </div>
  );
}

export function AdminMarketComparePage() {
  const { push } = useToast();
  const profiles = useAsyncData(() => marketApi.getCareerProfiles());
  const [careerId, setCareerId] = useState("");
  const careers = profiles.data?.careers ?? [];
  const selected = careerId || careers[0]?.id || "";
  const view = useAsyncData(() => (selected ? marketApi.getRoadmapVsMarket(selected) : Promise.resolve(null)), [selected]);

  async function promote(skillId: string) {
    try {
      const res = await marketApi.promoteMarketSkill(selected, skillId);
      push(res.created ? "Added as an admin requirement" : "Marked the existing requirement source=ADMIN");
      void view.reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Promote failed");
    }
  }

  if (profiles.error || view.error) return <ErrorState message={profiles.error ?? view.error ?? "Failed"} onRetry={() => void view.reload()} />;
  const sets = view.data?.sets;

  return (
    <Card>
      <CardHeader
        title="Roadmap vs market"
        description="Overlap, roadmap-only, market-only, emerging and importance mismatch. Promote writes source=ADMIN. Nothing else changes a career requirement."
      />
      <CardBody className="space-y-4">
        <select
          className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          value={selected}
          onChange={(e) => setCareerId(e.target.value)}
        >
          {careers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        {view.data?.period && (
          <p className="text-xs text-slate-500">
            {view.data.basis} {new Date(view.data.period.start).toLocaleDateString()} · {view.data.methodology.demand} / {view.data.methodology.trend}
          </p>
        )}
        {sets && (
          <div className="grid gap-4 lg:grid-cols-2">
            <List title="Overlap" rows={sets.overlap} />
            <List title="Roadmap only" rows={sets.roadmapOnly} />
            <List title="Market only" rows={sets.marketOnly} onPromote={(id) => void promote(id)} />
            <List title="Emerging" rows={sets.emerging} />
            <List title="Importance mismatch" rows={sets.mismatch} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
