import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CardBlockSkeleton, CardGridSkeleton, ListRowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { ProgressBar } from "@/components/ui/Progress";
import { SarkariFlags } from "@/components/sarkari/SarkariFlags";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useToast } from "@/store/hooks";
import * as sarkariApi from "@/services/api/sarkariApi";
import type { GovernmentExamDetail, TaskStatus } from "@/types";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useState } from "react";

const categoryLabel: Record<string, string> = {
  SSC: "SSC",
  UPSC: "UPSC",
  BANKING: "Banking",
  RAILWAY: "Railways",
  DEFENCE: "Defence",
  STATE: "State PSC",
  TEACHING: "Teaching",
};

export function SarkariHubPage() {
  const navigate = useNavigate();
  const exams = useAsyncData(() => sarkariApi.listExams());
  const myPlan = useAsyncData(() => sarkariApi.getMyExamPlan());
  const judge = useAsyncData(() => sarkariApi.getJudge());

  if (exams.loading && !exams.data) {
    return (
      <div className="space-y-6">
        <CardBlockSkeleton />
        <CardGridSkeleton count={4} />
      </div>
    );
  }
  if (exams.error) return <ErrorState onRetry={() => void exams.reload()} onDashboard={() => navigate("/dashboard")} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sarkari naukri preparation</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Plan SSC, UPSC, banking, railways, defence, and state PSC exams from the same profile you use for private-sector jobs.
          Vacancies and eligibility still need official notification checks.
        </p>
      </div>

      {judge.data && <SarkariFlags judge={judge.data} />}

      {myPlan.data && (
        <Card>
          <CardHeader
            title={`Active plan: ${myPlan.data.shortName}`}
            description={`${myPlan.data.plan?.completionPercent ?? 0}% syllabus marked complete`}
            action={
              <Link to={`/sarkari-naukri/${myPlan.data.slug}`}>
                <Button size="sm">Open plan</Button>
              </Link>
            }
          />
          <CardBody>
            <ProgressBar value={myPlan.data.plan?.completionPercent ?? 0} label="Topic coverage" />
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(exams.data ?? []).map((exam) => (
          <Card key={exam.id}>
            <CardBody className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{exam.shortName}</p>
                  <p className="text-sm text-slate-500">{exam.conductingBody}</p>
                </div>
                <Badge tone="brand">{categoryLabel[exam.category] ?? exam.category}</Badge>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">{exam.overview}</p>
              <p className="text-xs text-slate-500">
                {exam.educationRequirement} · {exam.ageLimit} · {exam.subjectCount} papers
              </p>
              <div className="flex flex-wrap gap-2">
                {exam.stages.map((s) => (
                  <Badge key={s} tone="neutral">
                    {s}
                  </Badge>
                ))}
              </div>
              <Link to={`/sarkari-naukri/${exam.slug}`}>
                <Button variant="outline" size="sm">
                  View syllabus & plan
                </Button>
              </Link>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function SarkariExamPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const exam = useAsyncData(() => sarkariApi.getExam(slug));
  const judge = useAsyncData(() => sarkariApi.getJudge());
  const [mockScore, setMockScore] = useState("60");
  const [mockSubject, setMockSubject] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  if (exam.loading && !exam.data) {
    return (
      <div className="space-y-4">
        <CardBlockSkeleton />
        <ListRowSkeleton count={4} />
      </div>
    );
  }
  if (exam.error || !exam.data) {
    return <ErrorState onRetry={() => void exam.reload()} onDashboard={() => navigate("/sarkari-naukri")} />;
  }

  const data = exam.data;

  async function startPlan() {
    const next = await sarkariApi.startExamPlan(slug);
    exam.setData(next);
    push("Preparation plan started. Career track set to government exams.");
    void judge.reload();
  }

  async function cycleTopic(subjectId: string, topic: string, status: TaskStatus) {
    const order: TaskStatus[] = ["not_started", "in_progress", "completed"];
    const nextStatus = order[(order.indexOf(status) + 1) % order.length];
    const next = await sarkariApi.updateExamTopic({ examSlug: slug, subjectId, topic, status: nextStatus });
    exam.setData(next);
  }

  async function saveMock() {
    const score = Number(mockScore);
    if (Number.isNaN(score)) return;
    await sarkariApi.logMock({
      examSlug: slug,
      subjectId: mockSubject || undefined,
      scorePercent: score,
    });
    push("Mock saved. Knowledge flag uses mocks, not board marks.");
    void judge.reload();
  }

  async function pullNotices() {
    setRefreshing(true);
    try {
      const result = await sarkariApi.refreshInternet();
      push(result.note);
      void judge.reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not refresh notices");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/sarkari-naukri" className="text-sm text-brand-700">
          ← All exams
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{data.name}</h1>
        <p className="text-sm text-slate-500">{data.conductingBody}</p>
      </div>

      <Card>
        <CardBody className="space-y-3 text-sm">
          <p>{data.overview}</p>
          <p>
            <span className="font-medium">Eligibility: </span>
            {data.eligibility}
          </p>
          <p>
            <span className="font-medium">Age: </span>
            {data.ageLimit} · <span className="font-medium">Education: </span>
            {data.educationRequirement}
          </p>
          {data.officialNote && <p className="text-xs text-slate-500">{data.officialNote}</p>}
          {data.plan?.isActive && judge.data?.exam?.slug === data.slug && <SarkariFlags judge={judge.data} />}
          {!data.plan?.isActive ? (
            <Button onClick={() => void startPlan()}>Start my {data.shortName} plan</Button>
          ) : (
            <div className="max-w-sm">
              <ProgressBar value={data.plan.completionPercent} label="Syllabus marked done" />
            </div>
          )}
        </CardBody>
      </Card>

      {data.plan?.isActive && <RoadmapBlocks exam={data} />}

      {data.plan?.isActive && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Mock / diagnostic"
              description="Knowledge is judged from these scores, not board percentage."
            />
            <CardBody className="space-y-3">
              <label className="block text-sm">
                Paper
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  value={mockSubject}
                  onChange={(e) => setMockSubject(e.target.value)}
                >
                  <option value="">Overall</option>
                  {data.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Score %
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  type="number"
                  min={0}
                  max={100}
                  value={mockScore}
                  onChange={(e) => setMockScore(e.target.value)}
                />
              </label>
              <Button size="sm" onClick={() => void saveMock()}>
                Save mock
              </Button>
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Latest notices (colour)"
              description="sarkariresult.com and official boards. Never used as eligibility."
              action={
                <Button size="sm" variant="outline" disabled={refreshing} onClick={() => void pullNotices()}>
                  {refreshing ? "Fetching…" : "Refresh from internet"}
                </Button>
              }
            />
            <CardBody className="space-y-3 text-sm">
              {(judge.data?.snapshots ?? []).length === 0 && (
                <p className="text-slate-500">No cached pages yet. Refresh after you start a plan.</p>
              )}
              {(judge.data?.snapshots ?? []).map((s) => (
                <div key={s.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <p className="font-medium">{s.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{s.site}</p>
                  <p className="mt-2 text-slate-600 dark:text-slate-300">{s.excerpt.slice(0, 220)}…</p>
                  <a className="mt-2 inline-block text-xs font-medium text-brand-700" href={s.url} target="_blank" rel="noreferrer">
                    Open source
                  </a>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Syllabus tracker</h2>
        {data.subjects.length === 0 && <EmptyState title="No subjects" description="Syllabus is not loaded for this exam yet." />}
        {data.subjects.map((subject) => (
          <Card key={subject.id}>
            <CardHeader title={subject.name} description={subject.weightage ? `Weightage: ${subject.weightage}` : undefined} />
            <CardBody className="flex flex-wrap gap-2">
              {subject.topics.map((topic) => (
                <button
                  key={topic.name}
                  type="button"
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs dark:border-slate-700"
                  onClick={() => void cycleTopic(subject.id, topic.name, topic.status)}
                  title="Click to cycle status"
                >
                  {topic.name} · {topic.status.replaceAll("_", " ")}
                </button>
              ))}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

function RoadmapBlocks({ exam }: { exam: GovernmentExamDetail }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {exam.plan?.roadmap.map((block) => (
        <Card key={block.phase}>
          <CardHeader title={block.phase} description={block.focus} />
          <CardBody>
            <ul className="list-disc space-y-2 pl-4 text-sm text-slate-600 dark:text-slate-300">
              {block.tasks.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
