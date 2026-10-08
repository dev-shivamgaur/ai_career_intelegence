import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { WhyPanel } from "@/components/ui/WhyPanel";
import type { PracticeCheck, SkillGapItem, SkillLesson } from "@/types";
import * as careerApi from "@/services/api/careerApi";
import { useState } from "react";
import { Link } from "react-router-dom";

export function SkillGapCard({
  item,
  onPracticed,
}: {
  item: SkillGapItem;
  onPracticed?: (next: SkillGapItem[]) => void;
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [lesson, setLesson] = useState<SkillLesson | null>(null);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [practicing, setPracticing] = useState(false);
  const [note, setNote] = useState("");
  const [lessonPhase, setLessonPhase] = useState(item.stretch ? "D60" : item.priority === "high" ? "D7" : "D30");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [check, setCheck] = useState<PracticeCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needsWork = item.currentStatus === "missing" || item.currentStatus === "needs_improvement";

  const lessonPhases = [
    { id: "D7", label: "7 days" },
    { id: "D30", label: "30 days" },
    { id: "D60", label: "60 days" },
    { id: "D90", label: "90 days" },
    { id: "D180", label: "180 days" },
  ];

  async function openLesson(phase = lessonPhase) {
    if (!item.id) return;
    setLessonPhase(phase);
    setLessonOpen(true);
    setLoadingLesson(true);
    setError(null);
    setCheck(null);
    try {
      const next = await careerApi.getSkillLesson(item.id, phase);
      setLesson(next);
      const init: Record<string, string> = {};
      for (const q of next.questions ?? []) init[q.id] = "";
      setAnswers(init);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lesson could not load");
    } finally {
      setLoadingLesson(false);
    }
  }

  async function markPracticed() {
    if (!item.id) return;
    setPracticing(true);
    setError(null);
    try {
      const payload = (lesson?.questions ?? []).map((q) => ({ id: q.id, text: answers[q.id] ?? "", prompt: q.prompt }));
      const result = await careerApi.practiceSkillGap(item.id, note.trim() || undefined, payload);
      setCheck(result.check ?? null);
      onPracticed?.(result.gaps);
      if (result.check?.passed) {
        setLessonOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save practice");
    } finally {
      setPracticing(false);
    }
  }

  return (
    <>
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{item.skill}</p>
              <p className="text-xs text-slate-500">
                {item.stretch ? "60–180 days" : item.priority === "high" ? "Next 7 days" : "Next 30 days"}
                {item.estimatedHours ? ` · about ${item.estimatedHours} hours` : ""}
                {item.category ? ` · ${item.category}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={item.currentStatus} />
              <Badge tone={item.priority === "high" ? "danger" : item.priority === "medium" ? "warning" : "neutral"}>
                {item.priority} priority
              </Badge>
              <Button size="sm" variant="ghost" onClick={() => setWhyOpen(true)}>
                How to close this
              </Button>
            </div>
          </div>
          {needsWork && item.why.solution && (
            <p className="text-sm text-slate-600 dark:text-slate-300">{item.why.solution}</p>
          )}
          {needsWork && (item.why.learnWhere?.length ?? 0) > 0 && (
            <div className="text-sm text-slate-600 dark:text-slate-300">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Where to learn</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {item.why.learnWhere!.slice(0, 3).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {needsWork && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void openLesson()}>
                Prepare this skill
              </Button>
              <Link
                to={`/roadmap?skill=${encodeURIComponent(item.skill)}`}
                className="inline-flex items-center text-sm font-medium text-brand-700"
              >
                Open on roadmap
              </Link>
            </div>
          )}
        </CardBody>
      </Card>
      <Modal open={whyOpen} onClose={() => setWhyOpen(false)} title={`Close the gap: ${item.skill}`}>
        <WhyPanel why={item.why} />
      </Modal>
      <Modal
        open={lessonOpen}
        onClose={() => setLessonOpen(false)}
        title={`Prepare: ${item.skill}`}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setLessonOpen(false)}>
              Close
            </Button>
            <Button disabled={practicing || loadingLesson} onClick={() => void markPracticed()}>
              {practicing
                ? /github\.com\//i.test(note)
                  ? "Checking GitHub (may take a minute)…"
                  : "Saving…"
                : /github\.com\//i.test(note)
                  ? "Check GitHub proof"
                  : "Submit answers & evidence"}
            </Button>
          </>
        }
      >
        {loadingLesson && (
          <div className="space-y-2">
            <p className="text-sm text-slate-500">Loading your plan (usually under 30 seconds)…</p>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {check && (
          <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${check.passed ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"}`}>
            {check.feedback} ({check.score}/100)
          </p>
        )}
        {lesson && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-1">
              {lessonPhases.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    lessonPhase === p.id
                      ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-950/40"
                      : "border-slate-300 text-slate-600 dark:border-slate-600"
                  }`}
                  onClick={() => void openLesson(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {lesson.questions?.length ?? 0} questions in this window
              {lesson.phase === "D30"
                ? " (30 days)"
                : lesson.phase === "D60"
                  ? " (60 days)"
                  : lesson.phase === "D90"
                    ? " (90 days)"
                    : lesson.phase === "D180"
                      ? " (180 days)"
                      : " (7 days)"}
              . About {item.estimatedHours || 4} hours for this topic. A longer window loads more questions, and they get harder.
            </p>
            <p className="font-medium text-slate-800 dark:text-slate-100">{lesson.learn}</p>
            {(lesson.where?.length ?? 0) > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Where to learn</h3>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-slate-700 dark:text-slate-200">
                  {lesson.where!.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            )}
            {lesson.outline.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">How to prepare</h3>
                <ol className="mt-1 list-decimal space-y-1 pl-4 text-sm text-slate-700 dark:text-slate-200">
                  {lesson.outline.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              </section>
            )}
            <p className="text-sm text-slate-600 dark:text-slate-300">{lesson.practice}</p>
            <label className="block">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">GitHub proof</span>
              <span className="mt-0.5 block text-xs text-slate-500">{lesson.evidencePrompt}</span>
              <textarea
                className="mt-1 h-24 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="https://github.com/owner/repo — what you built"
              />
            </label>
            {(lesson.questions?.length ?? 0) > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Written check (optional if the GitHub repo already shows this skill)
                </h3>
                {lesson.questions!.map((q, index) => (
                  <label key={q.id} className="block">
                    <span className="text-sm text-slate-700 dark:text-slate-200">
                      {index + 1}. {q.prompt}
                    </span>
                    <textarea
                      className="mt-1 h-24 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    />
                  </label>
                ))}
              </section>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
