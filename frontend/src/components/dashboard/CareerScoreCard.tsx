import { Card, CardBody } from "@/components/ui/Card";
import { EvidenceChip } from "@/components/ui/StatusBadge";
import { ProgressBar } from "@/components/ui/Progress";
import type { CareerAnalysis } from "@/types";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts";

export function CareerScoreCard({ analysis }: { analysis: CareerAnalysis }) {
  const data = [
    { name: "Skills", value: Math.max(0, analysis.breakdown.skills) },
    { name: "Projects", value: Math.max(0, analysis.breakdown.projects) },
    { name: "Education", value: Math.max(0, analysis.breakdown.education) },
    { name: "Experience", value: Math.max(0, analysis.breakdown.experience) },
    { name: "Market", value: Math.max(0, analysis.breakdown.marketAlignment) },
  ];
  const colors = ["#1f4bd4", "#3366f0", "#64748b", "#f59e0b", "#059669"];
  const hasSlice = data.some((d) => d.value > 0);

  return (
    <Card>
      <CardBody className="grid gap-6 lg:grid-cols-2">
        <div>
          <EvidenceChip kind="estimate" />
          <p className="mt-3 text-sm text-slate-500">Role readiness (not profile completeness)</p>
          <p className="text-4xl font-semibold">{analysis.estimatedMatch}%</p>
          <p className="mt-1 font-medium">How close you are to the target role</p>
          <p className="mt-2 text-sm text-slate-500">
            Weighted from skills (35%), projects (25%), education (15%), experience (10%), and syllabus coverage (15%).
            Experience blends job/intern rows with how many required role skills your resume and profile evidence — not
            years alone. Profile completion in the header is a different number.
          </p>
          <div className="mt-4 space-y-2">
            <ProgressBar value={analysis.breakdown.skills} label="Skills" />
            <ProgressBar value={analysis.breakdown.projects} label="Projects" />
            <ProgressBar value={analysis.breakdown.education} label="Education" />
            <ProgressBar value={analysis.breakdown.experience} label="Experience" />
            <ProgressBar value={analysis.breakdown.marketAlignment} label="Market alignment" />
          </div>
        </div>
        <div className="hidden h-64 min-h-[16rem] sm:block">
          {hasSlice ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                  {data.map((entry, i) => (
                    <Cell key={entry.name} fill={colors[i]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-slate-500">
              Bars above fill in after a target role and documents are saved.
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
