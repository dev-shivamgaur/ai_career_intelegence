import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EvidenceChip } from "@/components/ui/StatusBadge";
import { ErrorState, NeedSetupState, SETUP_CODES } from "@/components/ui/States";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { CareerScoreCard } from "@/components/dashboard/CareerScoreCard";
import { useProfile } from "@/context/ProfileContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as careerApi from "@/services/api/careerApi";
import { useToast } from "@/store/hooks";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function CareerAnalysisPage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const profile = useProfile();
  const analysis = useAsyncData(() => careerApi.getCareerAnalysis());
  const [running, setRunning] = useState(false);

  async function runAnalysis() {
    setRunning(true);
    try {
      analysis.setData(await careerApi.runCareerAnalysis());
      push("Analysis updated");
    } catch (err) {
      push(err instanceof Error ? err.message : "Analysis could not be generated");
    } finally {
      setRunning(false);
    }
  }

  if (profile.loading || analysis.loading) return <DashboardSkeleton />;
  const setupCode = analysis.errorCode && SETUP_CODES.has(analysis.errorCode) ? analysis.errorCode : undefined;
  if (setupCode) {
    return <NeedSetupState code={setupCode} onAction={(href) => navigate(href)} />;
  }
  if (analysis.error || !analysis.data) {
    return (
      <ErrorState
        message={analysis.error ?? undefined}
        code={analysis.errorCode}
        onRetry={() => void analysis.reload()}
        onDashboard={() => navigate("/dashboard")}
      />
    );
  }

  const analysisData = analysis.data;
  const title = profile.data?.careerGoal.title || analysisData.careerTitle || "Target career";

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description="Role readiness uses resume, projects, education, and the syllabus for this role. Missing areas are only topics we cannot match on your profile (REST matches REST APIs)."
        action={
          <Button disabled={running} onClick={() => void runAnalysis()}>
            {running ? "Analysing…" : "Refresh analysis"}
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        <EvidenceChip kind="analysis" />
        <EvidenceChip kind="estimate" />
      </div>

      <CareerScoreCard analysis={analysisData} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard title="Why this career may fit" items={analysisData.whyItMayFit} />
        <ListCard title="Strong areas" items={analysisData.strongAreas} />
        <ListCard title="Missing areas" items={analysisData.missingAreas} hint="These are syllabus/role topics with no matching evidence yet. Open skill gap for learn + practice steps." />
        <ListCard title="Potential challenges" items={analysisData.potentialChallenges} />
      </div>

      <Button variant="outline" onClick={() => navigate("/skill-gap")}>
        Open skill gap
      </Button>
    </div>
  );
}

function ListCard({ title, items, hint }: { title: string; items: string[]; hint?: string }) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody>
        {hint && <p className="mb-3 text-sm text-slate-500">{hint}</p>}
        <ul className="list-disc space-y-2 pl-5 text-sm">
          {(items ?? []).map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
