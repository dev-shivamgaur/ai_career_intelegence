import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as marketApi from "@/services/api/marketAdminApi";
import type { MarketRunDetail, MarketRunStatus } from "@/services/api/marketAdminApi";
import { useToast } from "@/store/hooks";
import { useState } from "react";
import {
  HiOutlineExclamation,
  HiOutlineInbox,
  HiOutlineOfficeBuilding,
  HiOutlinePlay,
  HiOutlineRefresh,
  HiOutlineReply,
  HiOutlineTrash,
} from "react-icons/hi";

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
  const [runPage, setRunPage] = useState(0);
  const [taskStatus, setTaskStatus] = useState("");
  const [taskKind, setTaskKind] = useState("");
  const [taskPage, setTaskPage] = useState(0);
  const [jobCompany, setJobCompany] = useState("");
  const [jobPage, setJobPage] = useState(0);
  const [queueName, setQueueName] = useState("market.fetch.dlq");
  const runs = useAsyncData(() => marketApi.listRuns(runPage * 20, 20), [runPage]);
  const tasks = useAsyncData(() => marketApi.listTasks({ status: taskStatus || undefined, kind: taskKind || undefined, skip: taskPage * 20, take: 20 }), [taskStatus, taskKind, taskPage]);
  const companies = useAsyncData(() => marketApi.listCompanyPostings());
  const jobs = useAsyncData(() => marketApi.listMarketJobs({ companyId: jobCompany || undefined, skip: jobPage * 20, take: 20 }), [jobCompany, jobPage]);
  const messages = useAsyncData(() => marketApi.peekQueue(queueName, 20), [queueName]);
  const [detail, setDetail] = useState<MarketRunDetail | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    void health.reload();
    void runs.reload();
    void tasks.reload();
    void companies.reload();
    void jobs.reload();
    void messages.reload();
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

  async function replay(count: number) {
    setBusy(true);
    try {
      const res = await marketApi.requeueDlq(queueName, count);
      push(`Moved ${res.moved} message(s) back. Reopened ${res.reopened} failed task(s).`);
      refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not requeue");
    } finally {
      setBusy(false);
    }
  }

  async function discard(count: number) {
    if (!window.confirm(`Remove ${count} message(s) from ${queueName}? The database row stays.`)) return;
    setBusy(true);
    try {
      const res = await marketApi.dropQueueMessages(queueName, count);
      push(`Removed ${res.dropped} message(s) from the queue`);
      refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not remove messages");
    } finally {
      setBusy(false);
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
            <div className="flex flex-wrap items-stretch gap-2">
              {h.queues.map((q, index) => {
                const live = q.messages > 0 && !q.queue.endsWith(".dlq");
                const dead = q.queue.endsWith(".dlq") && q.messages > 0;
                return (
                  <div key={q.queue} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQueueName(q.queue)}
                      className={`min-w-[9rem] rounded-lg border px-3 py-2 text-left text-xs ${
                        queueName === q.queue ? "border-ink" : "border-[#C4C4C4] dark:border-[#3A3333]"
                      } ${live ? "animate-pulse" : ""} ${dead ? "border-[#5C4E4E]" : ""}`}
                    >
                      <span className="flex items-center gap-1 font-medium">
                        {dead ? <HiOutlineExclamation className="h-3.5 w-3.5" /> : live ? <HiOutlinePlay className="h-3.5 w-3.5" /> : <HiOutlineInbox className="h-3.5 w-3.5" />}
                        {q.queue.replace("market.", "")}
                      </span>
                      <span className="text-[#5C4E4E] dark:text-[#988686]">
                        {q.messages} waiting · {q.consumers} worker{q.consumers === 1 ? "" : "s"}
                      </span>
                    </button>
                    {index < h.queues.length - 1 && <span className={`hidden h-px w-4 sm:block ${live ? "animate-pulse bg-ink" : "bg-[#C4C4C4]"}`} />}
                  </div>
                );
              })}
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
        <CardHeader title="Companies and posted jobs" description="A job is posted here after fetch and process. Zero means the board has not been saved yet." />
        <CardBody className="space-y-3">
          <ul className="grid gap-2 sm:grid-cols-2">
            {(companies.data ?? []).map((company) => (
              <li key={company.id}>
                <button
                  type="button"
                  className={`w-full rounded-lg border p-3 text-left text-sm ${jobCompany === company.id ? "border-ink" : "border-[#C4C4C4] dark:border-[#3A3333]"}`}
                  onClick={() => {
                    setJobCompany(company.id);
                    setJobPage(0);
                  }}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <HiOutlineOfficeBuilding className="h-4 w-4" />
                    {company.name}
                  </span>
                  <span className="mt-1 block text-xs text-[#5C4E4E] dark:text-[#988686]">
                    {company.posted} job{company.posted === 1 ? "" : "s"} · open {company.jobs.OPEN ?? 0} · closed {company.jobs.CLOSED ?? 0} · stale {company.jobs.STALE ?? 0}
                  </span>
                  <span className="mt-1 block text-xs text-[#5C4E4E] dark:text-[#988686]">
                    {company.sources.map((source) => `${source.type}${source.enabled ? "" : " off"}`).join(" · ") || "No source"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <ul className="divide-y divide-[#E4E4E4] text-sm dark:divide-[#3A3333]">
            {(jobs.data?.items ?? []).map((job) => (
              <li key={job.id} className="py-2">
                <p className="font-medium">{job.title}</p>
                <p className="text-xs text-[#5C4E4E] dark:text-[#988686]">
                  {job.company.name} · {job.status} · {job.locationText || "No location"} · first seen {fmt(job.firstSeenAt)}
                </p>
              </li>
            ))}
            {jobs.data && jobs.data.items.length === 0 && <li className="py-2 text-sm text-[#5C4E4E]">No saved jobs for this filter.</li>}
          </ul>
          <Pager page={jobPage} total={jobs.data?.total ?? 0} onPage={setJobPage} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Tasks"
          description="Queued is waiting. Running is in the worker. Fetch reads the board. Process turns raw posts into jobs. Failed is the row; the DLQ is the message."
          action={
            <div className="flex flex-wrap gap-2">
              <select className="h-8 rounded-lg border border-[#C4C4C4] bg-transparent px-2 text-xs" value={taskStatus} onChange={(e) => { setTaskStatus(e.target.value); setTaskPage(0); }}>
                <option value="">Any status</option>
                {["QUEUED", "RUNNING", "COMPLETED", "FAILED", "SKIPPED"].map((status) => <option key={status}>{status}</option>)}
              </select>
              <select className="h-8 rounded-lg border border-[#C4C4C4] bg-transparent px-2 text-xs" value={taskKind} onChange={(e) => { setTaskKind(e.target.value); setTaskPage(0); }}>
                <option value="">Any stage</option>
                {["FETCH", "PROCESS", "AGGREGATE", "RETENTION"].map((kind) => <option key={kind}>{kind}</option>)}
              </select>
            </div>
          }
        />
        <CardBody className="space-y-2">
          <ul className="divide-y divide-[#E4E4E4] text-sm dark:divide-[#3A3333]">
            {(tasks.data?.items ?? []).map((task) => (
              <li key={task.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={task.status === "FAILED" ? "danger" : task.status === "RUNNING" ? "brand" : task.status === "QUEUED" ? "warning" : "success"}>{task.status}</Badge>
                    <span className="font-medium">{task.kind}</span>
                    <span>{task.source ? task.source.company.name : "No company"}</span>
                  </p>
                  <p className="text-xs text-[#5C4E4E] dark:text-[#988686]">
                    Run {task.run.id.slice(0, 8)} · attempts {task.attempts} · {fmt(task.createdAt)}
                    {task.error ? ` · ${task.error}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <Pager page={taskPage} total={tasks.data?.total ?? 0} onPage={setTaskPage} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`Queue messages · ${queueName}`}
          description="A pulsing stage still has work. Replay puts a dead-letter message back. Remove drops it from RabbitMQ only."
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={busy || !queueName.endsWith(".dlq")} onClick={() => void replay(Math.max(1, messages.data?.length ?? 1))}>
                <HiOutlineReply className="h-4 w-4" /> Replay
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void discard(Math.max(1, messages.data?.length ?? 1))}>
                <HiOutlineTrash className="h-4 w-4" /> Remove
              </Button>
            </div>
          }
        />
        <CardBody>
          <ul className="space-y-2 text-xs">
            {(messages.data ?? []).map((message, index) => {
              const body = message.body && typeof message.body === "object" ? (message.body as { taskId?: string; queue?: string; attempt?: number }) : null;
              return (
                <li key={`${message.messageId ?? "msg"}-${index}`} className="rounded-lg border border-[#C4C4C4] p-2 dark:border-[#3A3333]">
                  <span className="flex items-center gap-1 font-medium">
                    <HiOutlineRefresh className="h-3.5 w-3.5" />
                    {body?.queue ?? queueName} · attempt {body?.attempt ?? "—"}
                  </span>
                  <span className="block text-[#5C4E4E] dark:text-[#988686]">task {body?.taskId ?? "unparsed"}</span>
                </li>
              );
            })}
            {messages.data && messages.data.length === 0 && <li className="text-sm text-[#5C4E4E]">This queue is empty.</li>}
            {messages.error && <li className="text-sm text-[#5C4E4E]">{messages.error}</li>}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Runs" />
        <CardBody className="space-y-3">
          <ul className="divide-y divide-stone-200 text-sm dark:divide-stone-800">
            {(runs.data?.items ?? []).map((r) => (
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
            {runs.data && runs.data.items.length === 0 && <li className="py-2 text-slate-500">No runs yet.</li>}
            <Pager page={runPage} total={runs.data?.total ?? 0} onPage={setRunPage} />
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

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / 20));
  return (
    <div className="flex items-center justify-between text-xs text-[#5C4E4E] dark:text-[#988686]">
      <span>
        {total} total · page {page + 1} of {pages}
      </span>
      <span className="flex gap-2">
        <button type="button" className="underline disabled:no-underline disabled:opacity-40" disabled={page <= 0} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button type="button" className="underline disabled:no-underline disabled:opacity-40" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </span>
    </div>
  );
}
