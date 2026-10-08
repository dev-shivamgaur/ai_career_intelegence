import { SkillGapCard } from "@/components/career/SkillGapCard";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, NeedSetupState, SETUP_CODES } from "@/components/ui/States";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as careerApi from "@/services/api/careerApi";
import { useToast } from "@/store/hooks";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNavigate } from "react-router-dom";

export function SkillGapPage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const { data, loading, error, errorCode, reload, setData } = useAsyncData(() => careerApi.getSkillGaps());
  const [generating, setGenerating] = useState(false);

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
  const chart = [...thisWeek, ...nextUp].slice(0, 12).map((d) => ({
    skill: d.skill.length > 18 ? `${d.skill.slice(0, 16)}…` : d.skill,
    hours: Math.max(1, Number(d.estimatedHours || (d.priority === "high" ? 6 : 8))),
    fill: d.priority === "high" ? "#1f4bd4" : "#94a3b8",
  }));
  const toClose = thisWeek;
  const stretch = data.filter((d) => d.stretch);
  const categories = [...new Set(data.filter((d) => !d.stretch).map((d) => d.category || "Other"))];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Skill gap"
        description="Topics follow your stack, not a generic beginner list. This week is the small app layer. 30 days is applied work. Longer windows are tougher and ask more questions."
        action={
          <Button variant="outline" disabled={generating} onClick={() => void generate()}>
            {generating ? "Recalculating…" : "Recalculate"}
          </Button>
        }
      />

      {chart.length > 0 && (
      <Card>
        <CardHeader
          title="Hours for open topics"
          description="Blue bars are the 7-day topics. Grey bars are the 30-day topics. Tougher topics are listed below."
        />
        <CardBody className="h-[min(28rem,70vh)] min-h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 16]} unit="h" />
              <YAxis type="category" dataKey="skill" width={110} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                {chart.map((entry) => (
                  <Cell key={entry.skill} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>
      )}

      {toClose.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">This week</h2>
          <p className="mb-3 text-sm text-slate-500">
            Finish these first. Each one is a few hours. Topics you already show on your resume are not listed here.
          </p>
          <div className="space-y-3">
            {toClose.map((item) => (
              <SkillGapCard key={`close-${item.id || item.skill}`} item={item} onPracticed={setData} />
            ))}
          </div>
        </section>
      )}

      {nextUp.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Next 30 days</h2>
          <p className="mb-3 text-sm text-slate-500">Applied topics for this stack. The lesson for this window has more checks than the 7-day set.</p>
          <div className="space-y-3">
            {nextUp.map((item) => (
              <SkillGapCard key={`next-${item.id || item.skill}`} item={item} onPracticed={setData} />
            ))}
          </div>
        </section>
      )}

      {stretch.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Tougher topics, 60–180 days</h2>
          <p className="mb-3 text-sm text-slate-500">
            These stay on the same stack. Open 60, 90, or 180 days in the lesson to get the longer, harder question set.
          </p>
          <div className="space-y-3">
            {stretch.map((item) => (
              <SkillGapCard key={`stretch-${item.id || item.skill}`} item={item} onPracticed={setData} />
            ))}
          </div>
        </section>
      )}

      {categories.map((cat) => {
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
                <SkillGapCard key={item.id || item.skill} item={item} onPracticed={setData} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
