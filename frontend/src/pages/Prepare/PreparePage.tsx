import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/States";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import * as prepApi from "@/services/api/preparationApi";
import type { PrepCurrent, PrepHistory, PrepPackageList, PrepProgress } from "@/services/api/preparationApi";
import { useToast } from "@/store/hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

type Step = "overview" | "lesson" | "practice" | "practical" | "review";

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `attempt-${Date.now()}`;
}

export function PreparePage() {
  const { skillId, taskId } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const [view, setView] = useState<PrepCurrent | null>(null);
  const [history, setHistory] = useState<PrepHistory | null>(null);
  const [packageList, setPackageList] = useState<PrepPackageList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("overview");
  const [lessonIndex, setLessonIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [optionId, setOptionId] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [feedback, setFeedback] = useState("");
  const [usage, setUsage] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [retry, setRetry] = useState(0);
  const inflight = useRef(false);

  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        let started: PrepCurrent | null = null;
        if (skillId && !taskId) {
          started = await prepApi.currentPreparation(skillId).catch(() => null);
        }
        if (!started) {
          started = await prepApi.startPreparation(taskId ? { roadmapTaskId: taskId } : { skillId });
        }
        if (cancel) return;
        setView(started);
        const resumeKey = started.session.resumeState?.lessonKey;
        const idx = Math.max(0, started.package.lessons.findIndex((l) => l.key === resumeKey));
        setLessonIndex(idx >= 0 ? idx : 0);
        const limits = await prepApi.preparationUsage().catch(() => null);
        if (!cancel && limits) setUsage(`${limits.plan} · grades ${limits.grades.used}/${limits.grades.limit}`);
        const hist = await prepApi.preparationHistory(started.session.id).catch(() => null);
        if (!cancel) setHistory(hist);
        const versions = await prepApi.listPrepPackages(started.session.skillId).catch(() => null);
        if (!cancel) setPackageList(versions);
      } catch (err) {
        if (!cancel) setError(err instanceof Error ? err.message : "Preparation could not start");
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    void load();
    return () => {
      cancel = true;
    };
  }, [skillId, taskId, retry]);

  const lesson = view?.package.lessons[lessonIndex] ?? view?.package.lessons[0];
  const hasPractical = (view?.package.tasks.length ?? 0) > 0;
  const latestByKey = useMemo(() => {
    const map = new Map<string, PrepCurrent["latest"][number]>();
    for (const row of view?.latest ?? []) map.set(row.questionKey, row);
    return map;
  }, [view]);
  const nextQuestion = lesson?.questionKeys
    .map((key) => view?.package.questions.find((q) => q.key === key))
    .find((q) => q && !latestByKey.has(q.key));

  function applyProgress(progress: PrepProgress) {
    setView((current) => (current ? { ...current, progress, session: { ...current.session, status: progress.status } } : current));
  }

  async function refreshHistory(sessionId: string) {
    const hist = await prepApi.preparationHistory(sessionId).catch(() => null);
    setHistory(hist);
  }

  async function switchToVersion(packageVersion: number, packageId?: string) {
    if (!view || busy) return;
    if (packageVersion === view.session.packageVersion) return;
    const ok = window.confirm(
      `Switch to package v${packageVersion}? Progress on the current version stays saved. You will start a fresh active session on the selected version (answers do not carry over).`,
    );
    if (!ok) return;
    setBusy(true);
    setFeedback("");
    try {
      const next = await prepApi.startPreparation({
        skillId: view.session.skillId,
        roadmapTaskId: view.session.roadmapTaskId ?? undefined,
        packageVersion,
        packageId,
        switchVersion: true,
      });
      setView(next);
      setStep("overview");
      setLessonIndex(0);
      setAnswer("");
      setOptionId("");
      setEvidence("");
      setIdempotencyKey(newKey());
      setShowHistory(false);
      await refreshHistory(next.session.id);
      const versions = await prepApi.listPrepPackages(next.session.skillId).catch(() => null);
      setPackageList(versions);
      push(`Now on package v${next.session.packageVersion}`);
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not switch package version");
    } finally {
      setBusy(false);
    }
  }

  const versionInfo = view?.versionInfo;
  const versions = packageList?.versions ?? [];
  const currentVersionIndex = versions.findIndex((row) => row.version === view?.session.packageVersion);

  async function submitAnswer() {
    if (!view || !nextQuestion || busy || inflight.current) return;
    const payload = nextQuestion.type === "mcq" ? optionId : answer;
    if (!payload.trim()) return;
    inflight.current = true;
    setBusy(true);
    setFeedback("");
    try {
      const result = await prepApi.submitAttempt(view.session.id, {
        questionKey: nextQuestion.key,
        answer: payload,
        idempotencyKey,
      });
      setFeedback(result.attempt?.feedback ?? "");
      applyProgress(result.progress);
      if (!result.duplicate && result.attempt) {
        setView((current) =>
          current
            ? {
                ...current,
                latest: [
                  ...current.latest.filter((row) => row.questionKey !== nextQuestion.key),
                  {
                    questionKey: nextQuestion.key,
                    score: result.attempt.score,
                    passed: result.attempt.passed,
                    feedback: result.attempt.feedback,
                    answer: payload,
                    attemptNumber: 1,
                  },
                ],
              }
            : current,
        );
      }
      setAnswer("");
      setOptionId("");
      setIdempotencyKey(newKey());
      await refreshHistory(view.session.id);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Could not save this answer");
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  async function finishLesson() {
    if (!view || !lesson || busy) return;
    setBusy(true);
    try {
      const next = await prepApi.completeLesson(view.session.id, lesson.key);
      setView(next);
      push("Lesson saved");
      if (lessonIndex < next.package.lessons.length - 1) {
        setLessonIndex(lessonIndex + 1);
        setStep("lesson");
      } else {
        setStep(hasPractical ? "practical" : "review");
      }
    } catch (err) {
      push(err instanceof Error ? err.message : "Lesson is not complete yet");
    } finally {
      setBusy(false);
    }
  }

  async function sendEvidence() {
    if (!view || busy || !evidence.trim()) return;
    const task = view.package.tasks[0];
    if (!task) return;
    setBusy(true);
    try {
      const result = await prepApi.submitTask(view.session.id, { taskKey: task.key, evidence: evidence.trim() });
      setFeedback(result.feedback);
      applyProgress(result.progress);
      await refreshHistory(view.session.id);
      if (result.progress.status === "VERIFIED") setStep("review");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Could not save evidence");
    } finally {
      setBusy(false);
    }
  }

  async function hint() {
    if (!view || !nextQuestion || busy) return;
    setBusy(true);
    try {
      const result = await prepApi.requestHint(view.session.id, nextQuestion.key);
      setFeedback(result.hint);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Hint is not available");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!view || busy) return;
    setBusy(true);
    try {
      const result = await prepApi.applyPreparation(view.session.id);
      push(`Applied. Roadmap tasks updated: ${result.roadmapTasksCompleted}.`);
      navigate("/roadmap");
    } catch (err) {
      push(err instanceof Error ? err.message : "Apply the plan only after it is verified");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <DashboardSkeleton />;
  if (error || !view || !lesson) {
    return <ErrorState message={error ?? "Preparation could not load"} onRetry={() => setRetry((n) => n + 1)} onDashboard={() => navigate("/dashboard")} />;
  }

  const progress = view.progress;
  const steps: Array<{ id: Step; label: string; hidden?: boolean }> = [
    { id: "overview", label: "Overview" },
    { id: "lesson", label: "Lesson" },
    { id: "practice", label: "Practice" },
    { id: "practical", label: "Practical", hidden: !hasPractical },
    { id: "review", label: "Review" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={view.package.skillName}
        description={`${view.package.careerTitle} · ${view.package.difficulty} · about ${view.package.estimatedMinutes} minutes · package v${view.session.packageVersion}`}
      />

      {versions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Package versions">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || currentVersionIndex <= 0}
            onClick={() => {
              const prev = versions[currentVersionIndex - 1];
              if (prev) void switchToVersion(prev.version, prev.packageId);
            }}
          >
            Previous
          </Button>
          {versions.map((row) => (
            <Button
              key={row.packageId}
              size="sm"
              variant={row.version === view.session.packageVersion ? "primary" : "outline"}
              disabled={busy}
              onClick={() => void switchToVersion(row.version, row.packageId)}
            >
              v{row.version}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            disabled={busy || currentVersionIndex < 0 || currentVersionIndex >= versions.length - 1}
            onClick={() => {
              const next = versions[currentVersionIndex + 1];
              if (next) void switchToVersion(next.version, next.packageId);
            }}
          >
            Next
          </Button>
          {versionInfo?.upgradeAvailable && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void switchToVersion(versionInfo.latest, versionInfo.latestPackageId)}
            >
              Latest v{versionInfo.latest}
            </Button>
          )}
        </div>
      )}

      {versionInfo?.upgradeAvailable && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p>
              Package v{versionInfo.latest} is available. You are on v{versionInfo.current}. Try the latest to re-check
              capability, or keep working on this version.
            </p>
            <Button size="sm" disabled={busy} onClick={() => void switchToVersion(versionInfo.latest, versionInfo.latestPackageId)}>
              Try latest
            </Button>
          </CardBody>
        </Card>
      )}

      <nav className="flex flex-wrap gap-2" aria-label="Preparation steps">
        {steps
          .filter((s) => !s.hidden)
          .map((s) => (
            <Button
              key={s.id}
              size="sm"
              variant={step === s.id ? "primary" : "outline"}
              onClick={() => setStep(s.id)}
            >
              {s.label}
            </Button>
          ))}
      </nav>

      <div className="grid gap-2 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500">Lessons</p>
            <p className="text-lg font-semibold">
              {progress.lessonCompleted}/{progress.lessonTotal}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500">Status</p>
            <p className="text-lg font-semibold">{progress.status.replace(/_/g, " ")}</p>
            <p className="text-xs text-slate-500">Quiz accuracy is not mastery</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500">Practical</p>
            <p className="text-lg font-semibold">
              {hasPractical ? `${progress.practicalVerified}/${progress.practicalRequired}` : "Not required"}
            </p>
          </CardBody>
        </Card>
      </div>

      {step === "overview" && (
        <Card>
          <CardHeader title="Learning path" description={progress.nextAction} />
          <CardBody className="space-y-3 text-sm">
            {view.package.prerequisites.length > 0 && (
              <p>
                Prerequisites: {view.package.prerequisites.map((p) => p.name).join(", ")}
              </p>
            )}
            <ol className="list-decimal space-y-1 pl-5">
              {view.package.lessons.map((row, index) => (
                <li key={row.key}>
                  <button
                    type="button"
                    className="text-left text-brand-700 underline"
                    onClick={() => {
                      setLessonIndex(index);
                      setStep("lesson");
                    }}
                  >
                    {row.title}
                  </button>
                </li>
              ))}
            </ol>
            {progress.weakConcepts.length > 0 && (
              <p className="text-amber-800 dark:text-amber-200">
                Weak concepts: {progress.weakConcepts.join(" · ")}
              </p>
            )}
            {usage && <p className="text-xs text-slate-500">{usage}</p>}
            <Button size="sm" onClick={() => setStep("lesson")}>
              Continue
            </Button>
          </CardBody>
        </Card>
      )}

      {step === "lesson" && (
        <Card>
          <CardHeader
            title={lesson.title}
            description={`Lesson ${lessonIndex + 1} of ${view.package.lessons.length}`}
          />
          <CardBody className="space-y-3 text-sm">
            <p>{lesson.explanation}</p>
            {lesson.examples.length > 0 && (
              <ul className="list-disc pl-4 text-slate-600 dark:text-slate-300">
                {lesson.examples.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            {lesson.mistakes.length > 0 && (
              <div>
                <p className="font-medium">Common mistakes</p>
                <ul className="list-disc pl-4 text-slate-600 dark:text-slate-300">
                  {lesson.mistakes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
            {lesson.codeBlocks?.map((block) => (
              <pre key={block.code.slice(0, 24)} className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                {block.caption ? `// ${block.caption}\n` : ""}
                {block.code}
              </pre>
            ))}
            {view.package.resources.length > 0 ? (
              <ul>
                {view.package.resources.map((resource) => (
                  <li key={resource.url}>
                    <a className="text-brand-700 underline" href={resource.url} target="_blank" rel="noreferrer">
                      {resource.title}
                    </a>
                    <span className="text-xs text-slate-500"> · {resource.verified ? "saved resource" : "unverified"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500">No saved learning resource for this skill.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setStep("practice")}>
                Practice this lesson
              </Button>
              {lessonIndex > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setLessonIndex((n) => n - 1)}>
                  Previous lesson
                </Button>
              )}
              {lessonIndex < view.package.lessons.length - 1 && (
                <Button size="sm" variant="outline" onClick={() => setLessonIndex((n) => n + 1)}>
                  Next lesson
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {step === "practice" && (
        <Card>
          <CardHeader
            title={nextQuestion ? "Next question" : "Questions in this lesson are answered"}
            description={view.package.completionSummary}
          />
          <CardBody className="space-y-3">
            {nextQuestion && <p className="text-sm">{nextQuestion.prompt}</p>}
            {nextQuestion?.type === "mcq" ? (
              <div className="space-y-2" role="radiogroup" aria-label="Answer options">
                {nextQuestion.options?.map((option) => (
                  <label key={option.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="prep-option"
                      checked={optionId === option.id}
                      onChange={() => setOptionId(option.id)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            ) : nextQuestion ? (
              <textarea
                className="h-32 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="What goes in, what can go wrong, and how you would check it."
                aria-label="Your answer"
              />
            ) : null}
            {feedback && <p className="text-sm text-slate-600 dark:text-slate-300">{feedback}</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy || !nextQuestion} onClick={() => void submitAnswer()}>
                {busy ? "Saving…" : "Submit answer"}
              </Button>
              <Button size="sm" variant="outline" disabled={busy || !nextQuestion} onClick={() => void hint()}>
                Hint
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void finishLesson()}>
                Mark lesson complete
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === "practical" && hasPractical && (
        <Card>
          <CardHeader title="Practical evidence" description={view.package.tasks[0]?.prompt} />
          <CardBody className="space-y-3">
            {view.package.tasks[0]?.acceptanceCriteria && view.package.tasks[0].acceptanceCriteria.length > 0 && (
              <ul className="list-disc pl-4 text-sm text-slate-600 dark:text-slate-300">
                {view.package.tasks[0].acceptanceCriteria.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            <input
              className="h-10 w-full rounded-lg border border-slate-300 px-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder={
                view.package.tasks[0]?.evidenceKind === "text"
                  ? "Describe your evidence"
                  : "https://github.com/owner/repo"
              }
              aria-label="Evidence"
            />
            {feedback && <p className="text-sm text-slate-600 dark:text-slate-300">{feedback}</p>}
            <Button size="sm" variant="outline" disabled={busy || !evidence.trim()} onClick={() => void sendEvidence()}>
              Submit evidence
            </Button>
          </CardBody>
        </Card>
      )}

      {step === "review" && (
        <Card>
          <CardHeader title="Review" description={progress.nextAction} />
          <CardBody className="space-y-3 text-sm">
            <p>
              Objectives passed: {progress.objectives.filter((o) => o.passed).length}/{progress.objectives.length}
            </p>
            {progress.weakConcepts.length > 0 ? (
              <p>Still weak: {progress.weakConcepts.join(" · ")}</p>
            ) : (
              <p>No weak objectives on the latest attempts.</p>
            )}
            {progress.status === "VERIFIED" && versionInfo?.upgradeAvailable && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                Verified on package v{versionInfo.current}. A newer v{versionInfo.latest} exists — try it to re-check
                capability. You can still apply this verification to the roadmap.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy || progress.status !== "VERIFIED"} onClick={() => void apply()}>
                Apply to roadmap
              </Button>
              {versionInfo?.upgradeAvailable && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void switchToVersion(versionInfo.latest, versionInfo.latestPackageId)}
                >
                  Try latest v{versionInfo.latest}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setShowHistory((v) => !v)}>
                {showHistory ? "Hide history" : "Show history"}
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Opening a lesson or sending a quiz answer does not complete the roadmap task. Apply does that only after
              status is verified.
            </p>
            {showHistory && history && (
              <ul className="max-h-64 space-y-2 overflow-y-auto text-xs">
                {history.attempts.map((row) => (
                  <li key={`${row.questionKey}-${row.attemptNumber}-${row.createdAt}`}>
                    {row.questionKey}: score {row.score} · {row.passed ? "passed" : "failed"} — {row.feedback}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
