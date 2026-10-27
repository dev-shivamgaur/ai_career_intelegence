import { createHash } from 'crypto';
import { hoursForTopic, localQuestions, prepareWhere, questionCountForPhase } from '../ai/lesson-check';
import { prepContentSchema, prepRubricSchema, type PrepContent, type PrepRubric } from './package.schema';

const GENERIC_SCOPE = '*';

export function genericCareerScope() {
  return GENERIC_SCOPE;
}

export function hashPackage(content: PrepContent, rubric: PrepRubric) {
  return createHash('sha256').update(JSON.stringify({ content, rubric })).digest('hex');
}

/** Existing published packages are reused. A model call happens only when none exists and quota allows. */
export function choosePackageSource(hasPublished: boolean, requested: boolean, quotaOk: boolean) {
  if (hasPublished) return 'reuse' as const;
  if (requested && quotaOk) return 'model' as const;
  if (requested && !quotaOk) return 'quota-fallback' as const;
  return 'deterministic' as const;
}

export function findIdempotentAttempt<T extends { idempotencyKey: string }>(rows: T[], key: string): T | null {
  return rows.find((row) => row.idempotencyKey === key) ?? null;
}

export type PackageInput = {
  skillId: string;
  skillName: string;
  careerTitle: string;
  prerequisites: Array<{ skillId: string; name: string }>;
  resources: Array<{ title: string; url: string; kind: string }>;
  dailyHours: number | null;
  phase: string | null;
  /** When true, omit the GitHub practical task (conceptual skills). */
  conceptual?: boolean;
};

export function buildDeterministicPackage(input: PackageInput): { content: PrepContent; rubric: PrepRubric; contentHash: string } {
  const place = input.careerTitle || 'your target role';
  const phase = input.phase ?? 'D30';
  const count = Math.min(4, questionCountForPhase(phase));
  const generated = localQuestions(input.skillName, place, 'missing', 'medium', count, phase);
  const where = prepareWhere(input.skillName, place, 'PROJECT');
  const hours = hoursForTopic(input.skillName, false);
  const lessonKey = 'practice';
  const objectiveKey = 'use-in-work';
  const mcqKey = 'q-proof';
  const shortQuestions = generated.slice(0, 3).map((q, index) => ({
    key: `q-${index + 1}`,
    lessonKey,
    objectiveKey,
    type: 'short' as const,
    prompt: q.prompt,
  }));
  const questions = [
    {
      key: mcqKey,
      lessonKey,
      objectiveKey,
      type: 'mcq' as const,
      prompt: `Which result shows you can use ${input.skillName} in ${place} work?`,
      options: [
        { id: 'artefact', label: 'A small task, with one thing that can go wrong, and a way you would check it.' },
        { id: 'definition', label: `A one-line definition that only repeats the name ${input.skillName}.` },
      ],
    },
    ...shortQuestions,
  ];
  const tasks = input.conceptual
    ? []
    : [{
        key: 'github-proof',
        prompt: `Paste a public GitHub URL whose code uses ${input.skillName}. A definition is not evidence.`,
        required: true,
        evidenceKind: 'github' as const,
      }];
  const content = prepContentSchema.parse({
    schemaVersion: 2,
    skillId: input.skillId,
    skillName: input.skillName,
    careerTitle: place,
    dailyHours: input.dailyHours,
    phase,
    objectives: [{
      key: objectiveKey,
      title: `Use ${input.skillName} on a real task`,
      questionKeys: questions.map((q) => q.key),
    }],
    prerequisites: input.prerequisites,
    estimatedMinutes: Math.min(600, Math.max(30, hours * 60)),
    difficulty: hours >= 12 ? 'advanced' : hours >= 8 ? 'core' : 'foundation',
    lessons: [{
      key: lessonKey,
      title: `${input.skillName} in practice`,
      explanation: where.join(' '),
      objectiveKey,
      questionKeys: questions.map((q) => q.key),
      examples: [`A working check names inputs, a failure, and how you would tell ${input.skillName} succeeded.`],
      mistakes: ['Repeating the skill name without a situation.', 'Opening the lesson and treating that as completion.'],
    }],
    resources: input.resources
      .filter((r) => /^https?:\/\//i.test(r.url))
      .map((r) => ({ title: r.title, url: r.url, kind: r.kind, verified: true })),
    questions,
    tasks,
    completionSummary: input.conceptual
      ? 'Verified when every objective question is passed. A quiz average alone is not mastery.'
      : 'Verified when every objective question is passed and the practical task is verified. A quiz average is not mastery.',
    nextActionTemplate: 'Continue the first unfinished lesson, then the weakest objective, then the practical task when present.',
  });
  const rubric = prepRubricSchema.parse({
    passLine: 70,
    questions: {
      [mcqKey]: { correctOptionId: 'artefact' },
      ...Object.fromEntries(shortQuestions.map((q) => [q.key, {}])),
    },
    tasks: input.conceptual ? {} : { 'github-proof': { requiresGithub: true, evidenceKind: 'github' } },
  });
  const contentHash = hashPackage(content, rubric);
  return { content, rubric, contentHash };
}

/** Drops model-suggested URLs that are not already stored learning resources. */
export function keepKnownResources(content: PrepContent, knownUrls: Set<string>): PrepContent {
  return {
    ...content,
    resources: content.resources.filter((r) => knownUrls.has(r.url)).map((r) => ({ ...r, verified: true })),
  };
}
