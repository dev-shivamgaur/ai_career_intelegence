import type { PrepContent } from './package.schema';

export type AttemptView = { questionKey: string; score: number; passed: boolean; attemptNumber: number };
export type TaskView = { taskKey: string; verified: boolean };
export type PrepStatusName = 'IN_PROGRESS' | 'NEEDS_PRACTICE' | 'VERIFIED';

export type ProgressSummary = {
  status: PrepStatusName;
  questionsAnswered: number;
  questionsCorrect: number;
  lessonCompleted: number;
  lessonTotal: number;
  assessmentScore: number | null;
  objectives: Array<{ key: string; title: string; proficiency: number; passed: boolean }>;
  practicalVerified: number;
  practicalRequired: number;
  weakConcepts: string[];
  nextAction: string;
};

function latestByQuestion(attempts: AttemptView[]) {
  const map = new Map<string, AttemptView>();
  for (const row of attempts) {
    const prev = map.get(row.questionKey);
    if (!prev || row.attemptNumber >= prev.attemptNumber) map.set(row.questionKey, row);
  }
  return map;
}

/** Derived from rows. Does not write roadmap tasks or treat a quiz average as mastery. */
export function deriveProgress(content: PrepContent, attempts: AttemptView[], tasks: TaskView[], passLine: number): ProgressSummary {
  const latest = latestByQuestion(attempts);
  const questionsAnswered = latest.size;
  const questionsCorrect = [...latest.values()].filter((a) => a.passed).length;
  const scores = [...latest.values()].map((a) => a.score);
  const assessmentScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const lessonCompleted = content.lessons.filter((lesson) =>
    lesson.questionKeys.every((key) => latest.has(key)),
  ).length;

  const objectives = content.objectives.map((objective) => {
    const rows = objective.questionKeys.map((key) => latest.get(key)).filter((row): row is AttemptView => Boolean(row));
    const proficiency = objective.questionKeys.length
      ? rows.filter((row) => row.passed).length / objective.questionKeys.length
      : 0;
    return {
      key: objective.key,
      title: objective.title,
      proficiency,
      passed: objective.questionKeys.every((key) => latest.get(key)?.passed) && objective.questionKeys.length > 0,
    };
  });

  const requiredTasks = content.tasks.filter((task) => task.required);
  const practicalVerified = requiredTasks.filter((task) => tasks.some((row) => row.taskKey === task.key && row.verified)).length;
  const allObjectivesPassed = objectives.every((o) => o.passed);
  const practicalDone = practicalVerified === requiredTasks.length;
  const finishedSet = content.questions.every((q) => latest.has(q.key));

  let status: PrepStatusName = 'IN_PROGRESS';
  if (allObjectivesPassed && practicalDone) status = 'VERIFIED';
  else if (finishedSet && assessmentScore !== null && assessmentScore < passLine) status = 'NEEDS_PRACTICE';

  const weakConcepts = objectives.filter((o) => !o.passed).map((o) => o.title);
  const incompleteLesson = content.lessons.find((lesson) => lesson.questionKeys.some((key) => !latest.has(key)));
  const weakest = objectives.filter((o) => !o.passed).sort((a, b) => a.proficiency - b.proficiency)[0];
  const unverified = requiredTasks.find((task) => !tasks.some((row) => row.taskKey === task.key && row.verified));
  let nextAction = 'Preparation is verified. You can apply it to the matching roadmap task.';
  if (incompleteLesson) nextAction = `Continue lesson: ${incompleteLesson.title}`;
  else if (weakest) nextAction = `Practice again: ${weakest.title}`;
  else if (unverified) nextAction = 'Submit the practical task evidence.';

  return {
    status,
    questionsAnswered,
    questionsCorrect,
    lessonCompleted,
    lessonTotal: content.lessons.length,
    assessmentScore,
    objectives,
    practicalVerified,
    practicalRequired: requiredTasks.length,
    weakConcepts,
    nextAction,
  };
}
