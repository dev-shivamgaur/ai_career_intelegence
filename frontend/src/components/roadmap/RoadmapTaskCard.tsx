import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import type { RoadmapCheck } from "@/services/api/careerApi";
import type { RoadmapTask } from "@/types";
import { useState } from "react";

export function RoadmapTaskCard({
  task,
  preparation,
  onUpdate,
  onCheck,
}: {
  task: RoadmapTask;
  preparation?: { completed: number; total: number; percent: number };
  onUpdate: (id: string, patch: Partial<Pick<RoadmapTask, "status" | "note">>) => void;
  onCheck: (id: string, answer: string) => Promise<RoadmapCheck>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(task.note ?? "");
  const [prepOpen, setPrepOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RoadmapCheck | null>(null);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const check = await onCheck(task.id, answer);
      setResult(check);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check this answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">{task.title}</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{task.description}</p>
          </div>
          <StatusBadge status={task.status} />
        </div>
        <p className="text-sm">
          <span className="font-medium">Why this matters: </span>
          {task.why}
        </p>
        <p className="text-xs text-slate-500">
          {task.priority} priority · {task.estimatedEffort} · {task.relatedSkill} · {task.suggestedResource}
        </p>
        {task.note && <p className="text-xs italic text-slate-500">Note: {task.note}</p>}
        <div className="flex flex-wrap gap-2">
          {task.status !== "completed" ? (
            <Button
              size="sm"
              onClick={() => {
                setResult(null);
                setError("");
                setPrepOpen(true);
              }}
            >
              Prepare and complete
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => onUpdate(task.id, { status: "skipped" })}>
            Skip
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            Add note
          </Button>
        </div>
      </CardBody>
      <Modal
        open={prepOpen}
        onClose={() => setPrepOpen(false)}
        title={task.title}
        size="lg"
        footer={
          result?.passed ? (
            <Button onClick={() => setPrepOpen(false)}>Close</Button>
          ) : (
            <Button disabled={busy || answer.trim().length < 40} onClick={() => void submit()}>
              {busy ? "Checking…" : "Check answer"}
            </Button>
          )
        }
      >
        <div className="space-y-3 text-sm">
          <p>
            Explain how a working {task.suggestedResource || "backend"} developer uses <span className="font-medium">{task.title}</span> on a real task: what goes in, what can go wrong, and how you would check it.
          </p>
          <textarea
            className="h-32 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Write the practical answer, not a one-line definition."
          />
          {error ? <p className="text-red-600">{error}</p> : null}
          {result ? (
            <div className="space-y-1 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
              <p className="font-medium">
                {result.score}/100 · {result.proficiency} · {result.passed ? "Passed" : "Not yet"}
              </p>
              <p>{result.accuracy}</p>
              <p className="text-slate-600 dark:text-slate-300">{result.feedback}</p>
              {preparation ? (
                <p className="text-slate-500">
                  Preparation {preparation.percent}% · {preparation.completed} of {preparation.total} roadmap topics finished.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add note"
        footer={
          <Button
            onClick={() => {
              onUpdate(task.id, { note });
              setOpen(false);
            }}
          >
            Save note
          </Button>
        }
      >
        <textarea
          className="h-28 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Modal>
    </Card>
  );
}
