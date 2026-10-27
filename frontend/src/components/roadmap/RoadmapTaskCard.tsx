import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import type { RoadmapTask } from "@/types";
import { useState } from "react";
import { Link } from "react-router-dom";

export function RoadmapTaskCard({
  task,
  preparation,
  onUpdate,
}: {
  task: RoadmapTask;
  preparation?: { completed: number; total: number; percent: number };
  onUpdate: (id: string, patch: Partial<Pick<RoadmapTask, "status" | "note">>) => void;
  onCheck?: (id: string, answer: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(task.note ?? "");

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
        {preparation ? (
          <p className="text-xs text-slate-500">
            Roadmap topics finished {preparation.completed} of {preparation.total} ({preparation.percent}%). This is not the preparation quiz score.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {task.status !== "completed" ? (
            <Link
              to={`/prepare/task/${task.id}`}
              className="inline-flex h-8 items-center rounded-lg bg-ink px-3 text-sm font-medium text-white"
            >
              Prepare and complete
            </Link>
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
