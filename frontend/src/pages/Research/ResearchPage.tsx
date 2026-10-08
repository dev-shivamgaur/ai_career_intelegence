import { ResearchSourceCard } from "@/components/research/ResearchSourceCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { ResearchSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/store/hooks";
import { useAsyncData } from "@/hooks/useAsyncData";
import { formatDate } from "@/lib/format";
import * as researchApi from "@/services/api/researchApi";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function ResearchPage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const { data, loading, error, reload, setData } = useAsyncData(() => researchApi.getResearchReport());
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      setData(await researchApi.rerunResearch());
      push("Market research saved");
    } catch (err) {
      push(err instanceof Error ? err.message : "Research could not run");
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <ResearchSkeleton />;
  if (error) return <ErrorState onRetry={() => void reload()} onDashboard={() => navigate("/dashboard")} />;
  if (!data || data.status === "idle") {
    return (
      <EmptyState
        title="No market research yet"
        description="This page scans the live web for the role you picked: hiring demand, common skills, and learning sources. We store a short report next to your documents so Copilot can use it. Nothing is sent off-site for you to study."
        action={
          <Button disabled={running} onClick={() => void run()}>
            {running ? "Scanning the market…" : "Run live research"}
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">AI research</h1>
          <p className="text-sm text-slate-500">
            Live market scan for {data.query ? `"${data.query}"` : "your selected role"}. We keep the findings here so
            recommendations stay tied to sources — not a blank page of zeros.
          </p>
        </div>
        <Button variant="outline" disabled={running} onClick={() => void run()}>
          {running ? "Refreshing…" : "Re-run research"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Research status" value={data.status.replaceAll("_", " ")} />
        <Stat label="Sources analyzed" value={String(data.sourcesAnalyzed)} />
        <Stat label="Job descriptions" value={String(data.jobDescriptions)} />
        <Stat label="Learning resources" value={String(data.learningResources)} />
        <Stat label="Government sources" value={String(data.governmentSources)} />
      </div>
      <p className="text-sm">
        Source verification: <Badge tone="success">{data.verificationStatus.replaceAll("_", " ")}</Badge>
      </p>
      <Card>
        <CardHeader title="Report summary" action={<Badge tone="info">Stored for this role</Badge>} />
        <CardBody className="text-sm leading-6">
          {data.summary || "No summary yet. Re-run research after you pick a career goal."}
        </CardBody>
      </Card>

      {data.findings.length > 0 && (
        <Card>
          <CardHeader title="What we learned" />
          <CardBody className="space-y-4">
            {data.findings.map((f) => (
              <div key={f.id}>
                <p className="text-sm font-medium">{f.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{f.content}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Research timeline" />
        <CardBody>
          {data.timeline.length === 0 ? (
            <p className="text-sm text-slate-500">Run research to see each step we took.</p>
          ) : (
            <ol className="space-y-3">
              {data.timeline.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="mt-1 h-2 w-2 rounded-full bg-emerald-600" aria-hidden />
                  <div>
                    <p className="font-medium">{e.label}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(e.timestamp)} · {e.status}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.sources.map((s) => (
          <ResearchSourceCard key={s.id} source={s} />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold capitalize">{value}</p>
    </div>
  );
}
