import { LinkedText, summaryPoints } from "@/components/research/LinkedText";
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
        description="This page looks up public web pages for the role you already picked. It stores a short report so you and Copilot can read the links later. It does not change your skill gap or roadmap."
        action={
          <Button disabled={running} onClick={() => void run()}>
            {running ? "Scanning the market…" : "Run live research"}
          </Button>
        }
      />
    );
  }

  const points = summaryPoints(data.summary);
  const role = roleFromQuery(data.query);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold">AI research</h1>
          <p className="mt-1 text-sm leading-6 text-[#5C4E4E] dark:text-[#988686]">
            A saved web brief for {role ? role : "your selected role"}. Wikipedia, Google News, and a short web lookup
            are stored here. This is not the company job board on Admin → Market, and it does not rewrite your skill gap.
          </p>
        </div>
        <Button variant="outline" disabled={running} onClick={() => void run()}>
          {running ? "Refreshing…" : "Re-run research"}
        </Button>
      </div>

      <Card>
        <CardBody className="text-sm leading-6 text-slate-700 dark:text-slate-200">
          You reach this page after a role is set. Use it when you want public links about that role. The header search
          is separate: it only finds skills, roadmap tasks, and jobs already on your account.
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Saved sources" value={String(data.sourcesAnalyzed)} hint="Links kept from the last run" />
        <Stat label="News headlines" value={String(data.jobDescriptions)} hint="News items, not company job posts" />
        <Stat label="Learning pages" value={String(data.learningResources)} hint="Mostly Wikipedia" />
        <Stat label="Government pages" value={String(data.governmentSources)} hint="Official exam notices are on Exam prep" />
      </div>

      <Card>
        <CardHeader
          title="What the scan found"
          description="Each line is one piece of the saved summary. Links open the public page."
          action={<Badge tone="info">{data.status.replaceAll("_", " ")}</Badge>}
        />
        <CardBody>
          {points.length === 0 ? (
            <p className="text-sm text-slate-500">No summary yet. Re-run research after you pick a career goal.</p>
          ) : (
            <ul className="space-y-3">
              {points.map((point) => (
                <li key={point.slice(0, 80)} className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  <LinkedText text={point} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {data.findings.length > 0 && (
        <Card>
          <CardHeader title="Notes from this run" description="Titles and links the scan kept. Open a link to read the source." />
          <CardBody className="space-y-4">
            {data.findings.map((finding) => (
              <div key={finding.id} className="border-b border-[#E4E4E4] pb-4 last:border-0 last:pb-0 dark:border-[#3A3333]">
                <p className="text-sm font-medium">{finding.title}</p>
                <div className="mt-2 space-y-2">
                  {findingLines(finding.content).map((line) => (
                    <p key={line.slice(0, 90)} className="text-sm leading-6 text-slate-700 dark:text-slate-200">
                      <LinkedText text={line} />
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="What this run did" />
        <CardBody>
          {data.timeline.length === 0 ? (
            <p className="text-sm text-slate-500">Run research to see each step we took.</p>
          ) : (
            <ol className="space-y-3">
              {data.timeline.map((event, index) => (
                <li key={event.id} className="flex gap-3 text-sm">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2B2B2B] text-[11px] text-white dark:bg-[#D1D0D0] dark:text-[#100E0E]">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium">{event.label}</p>
                    <p className="text-xs text-[#5C4E4E] dark:text-[#988686]">
                      {formatDate(event.timestamp)} · {event.status}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Sources</h2>
        {data.sources.length === 0 ? (
          <p className="text-sm text-slate-500">This run did not keep any links.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.sources.map((source) => (
              <ResearchSourceCard key={source.id} source={source} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function roleFromQuery(query?: string): string {
  if (!query) return "your selected role";
  const withoutTail = query.replace(/\s+skills demand India$/i, "").trim();
  const parts = withoutTail.split(/\s+/);
  if (parts.length < 2) return withoutTail;
  const last = parts[parts.length - 1].toLowerCase();
  const earlier = parts.slice(0, -1).join(" ").toLowerCase();
  if (last.includes("-") || earlier.includes(last.replace(/-/g, " "))) {
    return parts.slice(0, -1).join(" ");
  }
  return withoutTail;
}

function findingLines(content: string): string[] {
  const lines = content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines.slice(0, 12) : [content];
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-[#C4C4C4] bg-surface-card p-4 dark:border-[#3A3333] dark:bg-surface-dark-card">
      <p className="text-xs text-[#5C4E4E] dark:text-[#988686]">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[#5C4E4E] dark:text-[#988686]">{hint}</p>
    </div>
  );
}
