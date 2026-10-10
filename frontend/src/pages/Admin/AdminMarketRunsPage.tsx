import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as marketApi from "@/services/api/marketAdminApi";
import type { MarketRunDetail, MarketRunStatus } from "@/services/api/marketAdminApi";
import { useToast } from "@/store/hooks";
import { useState } from "react";

const STATUS_TONE: Record<MarketRunStatus, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  QUEUED: "neutral",
  RUNNING: "brand",
  COMPLETED: "success",
  PARTIAL_FAILED: "warning",
  FAILED: "danger",
};

function fmt(date: string | null) {
  return date ? new Date(date).toLocaleString() : "—";
}

function counts(map: Record<string, number> | null | undefined) {
  const entries = Object.entries(map ?? {}).filter(([, v]) => typeof v === "number");
  return entries.length ? entries.map(([k, v]) => `${k} ${v}`).join(" · ") : "—";
}

export function AdminMarketRunsPage() {
  const { push } = useToast();
  const health = useAsyncData(() => marketApi.getHealth());
  const runs = useAsyncData(() => marketApi.listRuns());
  const [detail, setDetail] = useState<MarketRunDetail | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    void health.reload();
    void runs.reload();
  }

  async function run(action: () => Promise<{ runId: string; taskCount: number }>, label: string) {
    setBusy(true);
    try {
      const res = await action();
      push(`${label}: ${res.taskCount} task(s) queued`);
      refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  }

  async function purge(id: string, mode: "policy" | "full") {
    if (mode === "full" && !window.confirm("Purge ALL raw descriptions and payloads for this source? This cannot be undone.")) return;
    try {
      const res = await marketApi.purgeSource(id, mode);
      push(`Purged ${res.descriptionsPurged} description(s), ${res.payloadsPurged} payload(s)`);
      void health.reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Purge failed");
    }
  }

  async function open(id: string) {
    try {
      setDetail(await marketApi.getRun(id));
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not load run");
    }
  }

  const error = health.error ?? runs.error;
  if (error) return <ErrorState message={error} code={health.errorCode ?? runs.errorCode} onRetry={refresh} />;
  const h = health.data;
  const pipelineOff = h ? !h.flags.pipeline : true;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Market pipeline"
          description="Fetch runs, retention and queue health. Runs need MARKET_PIPELINE_ENABLED and a worker started with WORKER_QUEUES including market."
          action={
            <Button size="sm" variant="ghost" onClick={refresh}>
              Refresh
            </Button>
          }
        />
        <CardBody className="space-y-4">
          {h && (
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={h.flags.pipeline ? "success" : "neutral"}>pipeline {h.flags.pipeline ? "on" : "off"}</Badge>
              <Badge tone={h.flags.scheduler ? "success" : "neutral"}>scheduler {h.flags.scheduler ? "on" : "off"}</Badge>
              <Badge tone={h.flags.llmExtraction ? "success" : "neutral"}>LLM extraction {h.flags.llmExtraction ? "on" : "off"}</Badge>
              <Badge tone={h.queueReady ? "success" : "warning"}>queue {h.queueReady ? "connected" : "not connected"}</Badge>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || pipelineOff} onClick={() => void run(() => marketApi.startFetchRun("due"), "Fetch due sources")}>
              Fetch due sources
            </Button>
            <Button size="sm" variant="outline" disabled={busy || pipelineOff} onClick={() => void run(() => marketApi.startFetchRun("all"), "Fetch all")}>
              Fetch all enabled
            </Button>
            <Button size="sm" variant="outline" disabled={busy || pipelineOff} onClick={() => void run(() => marketApi.startRetentionRun(), "Retention")}>
              Run retention now
            </Button>
            <Button size="sm" variant="outline" disabled={busy || pipelineOff} onClick={() => void run(() => marketApi.startAggregateRun(), "Aggregate")}>
              Aggregate demand
            </Button>
          </div>
          {h && h.queues.length > 0 && (
            <div className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-4">
              {h.queues.map((q) => (
                <div
                  key={q.queue}
                  className={`rounded-lg border px-3 py-2 ${
                    q.queue.endsWith(".dlq") && q.messages > 0
                      ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
                      : "border-stone-200 dark:border-stone-700"
                  }`}
                >
                  <p className="font-mono">{q.queue}</p>
                  <p className="text-slate-500">
                    {q.messages} msg · {q.consumers} consumer(s)
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Source health" />
        <CardBody>
          <ul className="divide-y divide-stone-200 text-sm dark:divide-stone-800">
            {(h?.sources ?? []).map((s) => (
              <li key={s.id} className="flex flex-col gap-2 py-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    {s.company} · {s.type} · <span className="font-mono">{s.boardToken}</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={s.fetchBlocker ? "warning" : "success"}>{s.fetchBlocker ?? "fetchable"}</Badge>
                    {s.consecutiveFailures > 0 && <Badge tone="danger">{s.consecutiveFailures} failed fetches</Badge>}
                    <Badge tone={s.robotsStatus === "DISALLOWED" ? "danger" : "neutral"}>robots {s.robotsStatus}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Jobs: {counts(s.listing)} · processing: {counts(s.processing)} · purged {s.contentPurged}
                  </p>
                  <p className="text-xs text-slate-500">
                    Last success {fmt(s.lastSuccessAt)} · last attempt {fmt(s.lastFetchAt)}
                    {s.lastError ? ` · ${s.lastError}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => void purge(s.id, "policy")}>
                    Purge expired
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void purge(s.id, "full")}>
                    Purge all raw text
                  </Button>
                </div>
              </li>
            ))}
            {h && h.sources.length === 0 && <li className="py-3 text-slate-500">No sources registered.</li>}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Runs" />
        <CardBody className="space-y-3">
          <ul className="divide-y divide-stone-200 text-sm dark:divide-stone-800">
            {(runs.data ?? []).map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p>
                    <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> <span className="font-medium">{r.kind}</span> ·{" "}
                    {r.trigger} · {fmt(r.createdAt)}
                    {r.windowKey ? ` · ${r.windowKey}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.completedTasks}/{r.totalTasks} done, {r.failedTasks} failed · {counts(r.counters)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void open(r.id)}>
                  Tasks
                </Button>
              </li>
            ))}
            {runs.data && runs.data.length === 0 && <li className="py-2 text-slate-500">No runs yet.</li>}
          </ul>
          {detail && (
            <div className="rounded-lg border border-stone-200 p-3 text-xs dark:border-stone-700">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium">
                  Run {detail.id} · {detail.kind}
                </p>
                <Button size="sm" variant="ghost" onClick={() => setDetail(null)}>
                  Close
                </Button>
              </div>
              <ul className="space-y-1">
                {detail.tasks.map((t) => (
                  <li key={t.id}>
                    <span className="font-mono">{t.kind}</span> · {t.status} · {t.source ? `${t.source.company.name} (${t.source.type})` : "—"} ·
                    attempts {t.attempts}
                    {t.durationMs !== null ? ` · ${t.durationMs} ms` : ""}
                    {t.counters ? ` · ${counts(t.counters as Record<string, number>)}` : ""}
                    {t.error ? <span className="text-red-600"> · {t.error}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
