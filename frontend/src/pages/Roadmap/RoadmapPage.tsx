import { RoadmapTaskCard } from "@/components/roadmap/RoadmapTaskCard";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/Progress";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState, ErrorState, NeedSetupState, SETUP_CODES } from "@/components/ui/States";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/store/hooks";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as careerApi from "@/services/api/careerApi";
import type { RoadmapTask } from "@/types";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

function FixedTopics({ title, items }: { title: string; items: string[] }) {
  const [open, setOpen] = useState(false);
  const head = items.slice(0, 5);
  const rest = items.slice(5);
  return (
    <div className="flex h-52 min-w-0 flex-col overflow-hidden">
      <h2 className="mb-1 h-5 shrink-0 text-sm font-semibold">{title}</h2>
      <div className="h-[7.5rem] shrink-0 overflow-hidden text-sm leading-6 text-slate-600 dark:text-slate-300">
        {head.length === 0 ? <p className="text-slate-400">Nothing in this window yet.</p> : null}
        {head.map((topic) => (
          <p key={topic} className="truncate">
            {topic}
          </p>
        ))}
      </div>
      <div className="mt-1 h-16 shrink-0 overflow-hidden">
        {rest.length > 0 ? (
          <button
            type="button"
            className="text-sm leading-5 tracking-widest text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            onClick={() => setOpen((value) => !value)}
          >
            ...
          </button>
        ) : null}
        {open && rest.length > 0 ? (
          <div className="h-11 w-full overflow-y-auto text-sm leading-6 text-slate-600 dark:text-slate-300">
            {rest.map((topic) => (
              <p key={topic} className="truncate">
                {topic}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const phases: { id: RoadmapTask["phase"]; label: string }[] = [
  { id: "7d", label: "Next 7 Days" },
  { id: "30d", label: "Next 30 Days" },
  { id: "60d", label: "31–60 Days" },
  { id: "90d", label: "61–90 Days" },
  { id: "180d", label: "91–180 Days" },
];

export function RoadmapPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const skillFilter = params.get("skill")?.trim() ?? "";
  const { push } = useToast();
  const [phase, setPhase] = useState<RoadmapTask["phase"]>("7d");
  const { data, loading, error, errorCode, reload, setData } = useAsyncData(
    () => careerApi.getRoadmap(phase),
    [phase],
  );

  const [building, setBuilding] = useState(false);

  async function buildFromSyllabus() {
    setBuilding(true);
    try {
      await careerApi.generateRoadmap();
      setData(await careerApi.getRoadmap(phase));
      push("Learning plan updated");
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not build the plan. Set a career goal first.");
    } finally {
      setBuilding(false);
    }
  }

  if (loading) return <DashboardSkeleton />;
  if (errorCode === "GOAL_NOT_FOUND" || (errorCode && SETUP_CODES.has(errorCode) && errorCode !== "ROADMAP_NOT_FOUND")) {
    return <NeedSetupState code={errorCode} onAction={(href) => navigate(href)} />;
  }
  if (errorCode === "ROADMAP_NOT_FOUND" || (!data && !error)) {
    return (
      <EmptyState
        title="No plan yet"
        description="After you pick a role we store the syllabus for that path and turn missing topics into tasks you can complete here."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button disabled={building} variant="outline" onClick={() => void buildFromSyllabus()}>
              {building ? "Rebuilding…" : "Rebuild plan from current gaps"}
            </Button>
            <Button variant="outline" onClick={() => navigate("/onboarding")}>
              Change goal
            </Button>
          </div>
        }
      />
    );
  }
  if (error || !data) return <ErrorState onRetry={() => void reload()} onDashboard={() => navigate("/dashboard")} />;

  const prep = data.preparation;
  const windowDone = data.tasks.filter((t) => t.status === "completed").length;
  const needle = skillFilter.toLowerCase();
  const visible = skillFilter
    ? data.tasks.filter(
        (t) => t.relatedSkill.toLowerCase().includes(needle) || t.title.toLowerCase().includes(needle),
      )
    : data.tasks;

  async function update(id: string, patch: Partial<Pick<RoadmapTask, "status" | "note">>) {
    const next = await careerApi.updateRoadmapTask(id, patch, phase);
    setData(next);
  }

  async function check(id: string, answer: string) {
    const result = await careerApi.checkRoadmapTask(id, answer, phase);
    setData(result.roadmap);
    if (result.check.passed) push("Topic marked done");
    return result.check;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-2xl font-semibold">Personalized roadmap</h1>
        <p className="text-sm text-slate-500">
          {data.pathLabel ? `${data.pathLabel}. ` : ""}
          {data.stackLabel ? `${data.stackLabel} · ` : ""}
          {data.roleSkillMatchPercent != null ? `${data.roleSkillMatchPercent}% role skills evidenced · ` : ""}
          {data.syllabusPercent != null ? `${data.syllabusPercent}% syllabus on your lane · ` : ""}
          Each tab loads only that window. Optional / later phases include advanced stretch topics you can skip.
        </p>
        {data.pathDetail ? <p className="mt-1 text-sm text-slate-500">{data.pathDetail}</p> : null}
        </div>
        <Button variant="outline" disabled={building} onClick={() => void buildFromSyllabus()}>
          {building ? "Rebuilding…" : "Rebuild plan from current gaps"}
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <FixedTopics key={`${phase}-next`} title="Study next" items={data.studyNext ?? data.tasks.map((task) => task.title)} />
        <FixedTopics key={`${phase}-optional`} title="Optional" items={data.optional ?? []} />
        <FixedTopics key={`${phase}-stacks`} title="Other stacks" items={data.alternatives ?? []} />
      </div>
      <ProgressBar
        value={prep?.percent ?? (data.tasks.length ? Math.round((windowDone / data.tasks.length) * 100) : 0)}
        label={
          prep
            ? `Preparation · ${prep.completed} of ${prep.total} topics finished · this window ${windowDone}/${data.tasks.length || 0}`
            : "Roadmap completion"
        }
      />
      {skillFilter ? (
        <p className="text-sm text-slate-500">
          Showing tasks for <span className="font-medium">{skillFilter}</span>.{" "}
          <button type="button" className="font-medium text-brand-700" onClick={() => navigate("/roadmap")}>
            Show all
          </button>
        </p>
      ) : (
        <Tabs
          tabs={phases.map((p) => ({
            id: p.id,
            label: `${p.label}${data.phaseCounts?.[p.id] != null ? ` (${data.phaseCounts[p.id]})` : ""}`,
          }))}
          value={phase}
          onChange={(id) => setPhase(id as RoadmapTask["phase"])}
        />
      )}
      {visible.length === 0 ? (
        <EmptyState
          title="No topics in this window"
          description="This tab only loads this time range. Rebuild the plan if the count is zero, or open another range."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((t) => (
            <RoadmapTaskCard
              key={t.id}
              task={t}
              preparation={prep}
              onUpdate={(id, patch) => void update(id, patch)}
              onCheck={check}
            />
          ))}
        </div>
      )}
    </div>
  );
}
