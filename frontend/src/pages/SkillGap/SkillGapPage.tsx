import { SkillGapCard } from "@/components/career/SkillGapCard";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, NeedSetupState, SETUP_CODES } from "@/components/ui/States";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as careerApi from "@/services/api/careerApi";
import { useToast } from "@/store/hooks";
import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useNavigate, useSearchParams } from "react-router-dom";

export function SkillGapPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const skillFilter = params.get("skill")?.trim() ?? "";
  const { push } = useToast();
  const { data, loading, error, errorCode, reload, setData } = useAsyncData(() => careerApi.getSkillGaps());
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!skillFilter) return;
    document.getElementById("skill-search-hit")?.scrollIntoView({ block: "start" });
  }, [skillFilter, data]);

  async function generate() {
    setGenerating(true);
    try {
      setData(await careerApi.recalculateSkillGaps());
      push("Skill gaps updated");
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not generate skill gaps");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <DashboardSkeleton />;
  if (errorCode && SETUP_CODES.has(errorCode)) {
    return <NeedSetupState code={errorCode} onAction={(href) => navigate(href)} />;
  }
  if (error) {
    return (
      <ErrorState
        message={error}
        code={errorCode}
        onRetry={() => void reload()}
        onDashboard={() => navigate("/dashboard")}
      />
    );
  }
  if (!data?.length) {
    return (
      <EmptyState
        title="Skill gaps have not been generated yet"
        description="Current skills, resume, and documents vs the stored syllabus for your role."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button disabled={generating} onClick={() => void generate()}>
              {generating ? "Generating…" : "Generate skill gaps"}
            </Button>
            <Button variant="outline" onClick={() => navigate("/onboarding")}>
              Set career goal
            </Button>
          </div>
        }
      />
    );
  }

  const open = (d: (typeof data)[number]) =>
    d.currentStatus === "missing" || d.currentStatus === "needs_improvement";
  const thisWeek = data.filter((d) => !d.stretch && d.priority === "high" && open(d));
  const nextUp = data.filter((d) => !d.stretch && d.priority !== "high" && open(d));
  const slices = ["#2B2B2B", "#5C4E4E", "#988686", "#8AA89A", "#AFEEEE", "#C4C4C4"];
  const chart = [...thisWeek, ...nextUp].slice(0, 8).map((d, i) => ({
    skill: d.skill,
    hours: Math.max(1, Number(d.estimatedHours || (d.priority === "high" ? 6 : 8))),
    fill: slices[i % slices.length],
  }));
  const toClose = thisWeek;
  const stretch = data.filter((d) => d.stretch);
  const categories = [...new Set(data.filter((d) => !d.stretch).map((d) => d.category || "Other"))];
  const needle = skillFilter.toLowerCase();
  const matched = skillFilter
    ? data.filter((item) => {
        const name = item.skill.toLowerCase();
        return name.includes(needle) || needle.includes(name);
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Skill gap"
        description="Open topics for your stack. This week is the short list. Later topics stay on the plan but do not jump the queue."
        action={
          <Button variant="outline" disabled={generating} onClick={() => void generate()}>
            {generating ? "Recalculating…" : "Recalculate"}
          </Button>
        }
      />

      {skillFilter ? (
        <Card id="skill-search-hit">
          <CardHeader
            title={matched.length ? skillFilter : "Not found"}
            description={
              matched.length
                ? "This is the skill from your header search. It is already on your skill gap."
                : `${skillFilter} is not on your skill gap. Search only finds skills, roadmap tasks, and jobs already saved for you.`
            }
            action={
              <Button variant="outline" size="sm" onClick={() => navigate("/skill-gap")}>
                Show all skills
              </Button>
            }
          />
          {matched.length > 0 && (
            <CardBody className="space-y-3">
              {matched.map((item) => (
                <SkillGapCard key={`hit-${item.id || item.skill}`} item={item} />
              ))}
            </CardBody>
          )}
        </Card>
      ) : null}

      {!skillFilter && chart.length > 0 && (
      <Card>
        <CardHeader
          title="Practice time"
          description="Each slice is the focused hours for one open topic. The list under the chart is the order to follow."
        />
        <CardBody className="grid gap-4 md:grid-cols-[16rem_1fr] md:items-center">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chart} dataKey="hours" nameKey="skill" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="none">
                  {chart.map((entry) => (
                    <Cell key={entry.skill} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value} hours`, "Practice"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-2 text-sm">
            {chart.map((entry) => (
              <li key={entry.skill} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: entry.fill }} />
                  <span className="truncate">{entry.skill}</span>
                </span>
                <span className="shrink-0 text-[#5C4E4E] dark:text-[#988686]">{entry.hours} h</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      )}

      {!skillFilter && toClose.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink dark:text-[#D1D0D0]">This week</h2>
          <p className="mb-3 text-sm text-[#5C4E4E] dark:text-[#988686]">
            Finish these first. Hours come from the plan for each topic. Skills you already show are not listed here.
          </p>
          <div className="space-y-3">
            {toClose.map((item) => (
              <SkillGapCard key={`close-${item.id || item.skill}`} item={item} />
            ))}
          </div>
        </section>
      )}

      {!skillFilter && nextUp.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink dark:text-[#D1D0D0]">Next 30 days</h2>
          <p className="mb-3 text-sm text-[#5C4E4E] dark:text-[#988686]">Applied topics for this stack. The 30-day lesson asks more than the one-week set.</p>
          <div className="space-y-3">
            {nextUp.map((item) => (
              <SkillGapCard key={`next-${item.id || item.skill}`} item={item} />
            ))}
          </div>
        </section>
      )}

      {!skillFilter && stretch.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink dark:text-[#D1D0D0]">Later topics</h2>
          <p className="mb-3 text-sm text-slate-500">
            These stay on the same stack. Open 60, 90, or 180 days in the lesson to get the longer, harder question set.
          </p>
          <div className="space-y-3">
            {stretch.map((item) => (
              <SkillGapCard key={`stretch-${item.id || item.skill}`} item={item} />
            ))}
          </div>
        </section>
      )}

      {!skillFilter && categories.map((cat) => {
        const items = data.filter(
          (d) =>
            !d.stretch &&
            (d.category || "Other") === cat &&
            d.currentStatus !== "missing" &&
            d.currentStatus !== "needs_improvement",
        );
        if (!items.length) return null;
        return (
          <section key={cat}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{cat}</h2>
            <div className="space-y-3">
              {items.map((item) => (
                <SkillGapCard key={item.id || item.skill} item={item} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
