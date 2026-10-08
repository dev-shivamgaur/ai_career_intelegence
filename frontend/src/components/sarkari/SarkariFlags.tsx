import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { SarkariFlagStatus, SarkariJudge } from "@/types";

const tone: Record<SarkariFlagStatus, "success" | "warning" | "danger" | "neutral"> = {
  match: "success",
  not_yet: "warning",
  outside: "danger",
  unknown: "neutral",
};

export function SarkariFlags({ judge }: { judge: SarkariJudge }) {
  const name = judge.exam?.shortName ?? "this exam";
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <FlagCard
          title={`Age vs ${name}`}
          status={judge.age.status}
          detail={judge.age.detail}
        />
        <FlagCard
          title={`Education vs ${name}`}
          status={judge.education.status}
          detail={judge.education.detail}
        />
        <FlagCard
          title={`Knowledge vs ${name}`}
          status={judge.knowledge.status}
          detail={judge.knowledge.detail}
        />
      </div>
      {(judge.capability || (judge.studyNext?.length ?? 0) > 0 || (judge.studied?.length ?? 0) > 0) && (
        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <CardHeader title="What we can see" />
            <CardBody className="text-sm text-slate-600 dark:text-slate-300">
              {judge.capability ?? "Upload papers and log a mock to judge capability."}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Study next" />
            <CardBody>
              <ul className="list-disc space-y-1 pl-4 text-sm text-slate-600 dark:text-slate-300">
                {(judge.studyNext ?? []).length
                  ? (judge.studyNext ?? []).map((p) => <li key={p}>{p}</li>)
                  : <li>Log a mock or tick topics on the exam page.</li>}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Already marked / mocked" />
            <CardBody>
              <ul className="list-disc space-y-1 pl-4 text-sm text-slate-600 dark:text-slate-300">
                {(judge.studied ?? []).length
                  ? (judge.studied ?? []).map((p) => <li key={p}>{p}</li>)
                  : <li>Nothing ticked or mocked yet.</li>}
              </ul>
            </CardBody>
          </Card>
        </div>
      )}
      <p className="text-xs text-slate-500">{judge.disclaimer}</p>
    </div>
  );
}

function FlagCard({ title, status, detail }: { title: string; status: SarkariFlagStatus; detail: string }) {
  return (
    <Card>
      <CardHeader
        title={title}
        action={<Badge tone={tone[status]}>{status.replaceAll("_", " ")}</Badge>}
      />
      <CardBody className="text-sm text-slate-600 dark:text-slate-300">{detail}</CardBody>
    </Card>
  );
}
