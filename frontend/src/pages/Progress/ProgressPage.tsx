import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ProgressRing } from "@/components/ui/Progress";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState, NeedSetupState, SETUP_CODES } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as appApi from "@/services/api/appApi";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function ProgressPage() {
  const navigate = useNavigate();
  const { data, loading, error, errorCode, reload } = useAsyncData(() => appApi.getProgress());
  if (loading) return <DashboardSkeleton />;
  if (errorCode && SETUP_CODES.has(errorCode)) {
    return <NeedSetupState code={errorCode} onAction={(href) => navigate(href)} />;
  }
  if (error || !data) return <ErrorState onRetry={() => void reload()} onDashboard={() => navigate("/dashboard")} />;

  const skillPct = data.skillsTotal ? Math.round((data.skillsCompleted / data.skillsTotal) * 100) : 0;
  const stats = [
    {
      label: "Syllabus covered",
      value: `${data.skillsCompleted} of ${data.skillsTotal}`,
      hint: "Topics with evidence on your profile.",
      percent: skillPct,
    },
    {
      label: "Roadmap",
      value: `${data.roadmapPercent}%`,
      hint: "Tasks you marked done.",
      percent: data.roadmapPercent,
    },
    {
      label: "Practice hours",
      value: String(data.learningHours),
      hint: "Hours recorded against open topics.",
      percent: Math.min(100, data.learningHours * 4),
    },
    {
      label: "Projects",
      value: String(data.projectsCompleted),
      hint: "Projects saved from your documents or GitHub.",
      percent: Math.min(100, data.projectsCompleted * 20),
    },
    {
      label: "Applications",
      value: String(data.applications),
      hint: "Roles you marked as applied.",
      percent: Math.min(100, data.applications * 10),
    },
    {
      label: "Interview prep",
      value: `${data.interviewPrepPercent}%`,
      hint: "Share of interview tasks finished.",
      percent: data.interviewPrepPercent,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#5C4E4E] dark:text-[#988686]">
          How far your saved evidence covers the syllabus, and how much of the roadmap you have finished.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-4 rounded-xl border border-[#C4C4C4] bg-surface-card p-4 dark:border-[#3A3333] dark:bg-surface-dark-card">
            <ProgressRing value={stat.percent} size={64} stroke={6} />
            <div className="min-w-0">
              <p className="text-xs text-[#5C4E4E] dark:text-[#988686]">{stat.label}</p>
              <p className="text-xl font-semibold">{stat.value}</p>
              <p className="text-xs text-[#5C4E4E] dark:text-[#988686]">{stat.hint}</p>
            </div>
          </div>
        ))}
      </div>
      <Chart title="Skill progress over time" data={data.skillProgressOverTime} dataKey="skills" />
      <Chart title="Roadmap completion" data={data.roadmapCompletionOverTime} dataKey="percent" />
      <Chart title="Applications over time" data={data.applicationsOverTime} dataKey="count" />
    </div>
  );
}

function Chart({
  title,
  data,
  dataKey,
}: {
  title: string;
  data: Record<string, string | number>[];
  dataKey: string;
}) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="h-56 sm:h-64">
        {data?.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid stroke="#D3D3D3" strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis width={36} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey={dataKey} stroke="#2B2B2B" fill="#AFEEEE" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-slate-500">No points yet. Practice a skill to start the line.</p>
        )}
      </CardBody>
    </Card>
  );
}
