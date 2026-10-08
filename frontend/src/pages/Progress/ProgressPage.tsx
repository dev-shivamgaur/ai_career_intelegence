import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState, NeedSetupState, SETUP_CODES } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as appApi from "@/services/api/appApi";
import { useNavigate } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
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

  const stats = [
    ["Syllabus topics evidenced", `${data.skillsCompleted}/${data.skillsTotal}`],
    ["Roadmap progress", `${data.roadmapPercent}%`],
    ["Learning hours", String(data.learningHours)],
    ["Projects completed", String(data.projectsCompleted)],
    ["Applications", String(data.applications)],
    ["Interview preparation", `${data.interviewPrepPercent}%`],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Progress</h1>
        <p className="mt-1 text-sm text-slate-500">
          Topics evidenced from your documents and skills versus the stored syllabus for your role.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs text-slate-500">{k}</p>
            <p className="mt-1 text-2xl font-semibold">{v}</p>
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
            <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis width={36} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey={dataKey} stroke="#1f4bd4" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-slate-500">No points yet. Practice a skill to start the line.</p>
        )}
      </CardBody>
    </Card>
  );
}
