import { z } from 'zod';

export const questionTypeSchema = z.enum([
  'mcq',
  'short',
  'sql',
  'code',
  'practical',
  'scenario',
  'theory',
]);

const questionSchema = z.object({
  key: z.string().min(1).max(80),
  lessonKey: z.string().min(1).max(80),
  objectiveKey: z.string().min(1).max(80),
  type: questionTypeSchema,
  prompt: z.string().min(8).max(2000),
  options: z.array(z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(400) })).max(6).optional(),
  hints: z.array(z.string().max(300)).max(4).optional(),
  maxAttempts: z.number().int().min(1).max(20).optional(),
});

const diagramSchema = z.object({
  kind: z.enum(['mermaid', 'ascii']),
  body: z.string().min(1).max(4000),
});

const codeBlockSchema = z.object({
  language: z.string().min(1).max(40),
  code: z.string().min(1).max(6000),
  caption: z.string().max(200).optional(),
});

export const prepContentSchema = z.object({
  schemaVersion: z.number().int().min(1).max(10).default(1),
  skillId: z.string().min(1),
  skillName: z.string().min(1).max(120),
  careerTitle: z.string().max(160),
  dailyHours: z.number().int().min(0).max(24).nullable(),
  phase: z.string().max(16).nullable(),
  targetCareerSlugs: z.array(z.string().min(1).max(80)).max(12).optional(),
  subtopics: z.array(z.object({
    key: z.string().min(1).max(80),
    title: z.string().min(1).max(200),
    order: z.number().int().min(0).max(100),
    objectiveKeys: z.array(z.string()).max(12),
  })).max(20).optional(),
  objectives: z.array(z.object({
    key: z.string().min(1).max(80),
    title: z.string().min(1).max(200),
    questionKeys: z.array(z.string()).min(1).max(30),
  })).min(1).max(12),
  prerequisites: z.array(z.object({ skillId: z.string(), name: z.string() })).max(20),
  estimatedMinutes: z.number().int().min(10).max(600),
  difficulty: z.enum(['foundation', 'core', 'advanced']),
  lessons: z.array(z.object({
    key: z.string().min(1).max(80),
    title: z.string().min(1).max(200),
    explanation: z.string().min(8).max(4000),
    objectiveKey: z.string(),
    subtopicKey: z.string().max(80).optional(),
    questionKeys: z.array(z.string()).min(1),
    examples: z.array(z.string().max(500)).max(6),
    mistakes: z.array(z.string().max(500)).max(6),
    diagrams: z.array(diagramSchema).max(4).optional(),
    codeBlocks: z.array(codeBlockSchema).max(4).optional(),
  })).min(1).max(8),
  resources: z.array(z.object({
    key: z.string().min(1).max(80).optional(),
    title: z.string(),
    url: z.string().url(),
    kind: z.string(),
    verified: z.boolean(),
  })).max(20),
  questions: z.array(questionSchema).min(1).max(40),
  tasks: z.array(z.object({
    key: z.string().min(1).max(80),
    prompt: z.string().min(8).max(2000),
    required: z.boolean(),
    evidenceKind: z.enum(['github', 'url', 'text', 'none']).optional(),
    acceptanceCriteria: z.array(z.string().max(300)).max(8).optional(),
  })).max(8),
  completionSummary: z.string().max(500),
  nextActionTemplate: z.string().max(300),
  diagnostic: z.object({
    questionKeys: z.array(z.string()).min(1).max(10),
  }).optional(),
});

export const prepRubricSchema = z.object({
  passLine: z.number().int().min(0).max(100),
  questions: z.record(z.string(), z.object({
    correctOptionId: z.string().optional(),
    modelAnswer: z.string().max(2000).optional(),
    keywords: z.array(z.string().max(80)).max(20).optional(),
    rubricPoints: z.array(z.string().max(200)).max(12).optional(),
    testHints: z.array(z.string().max(200)).max(8).optional(),
  })),
  tasks: z.record(z.string(), z.object({
    requiresGithub: z.boolean().optional(),
    evidenceKind: z.enum(['github', 'url', 'text', 'none']).optional(),
    acceptPatterns: z.array(z.string().max(120)).max(12).optional(),
    minScore: z.number().int().min(0).max(100).optional(),
  })),
});

export const gradeSchema = z.object({
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  feedback: z.string().min(1).max(500),
});

export type PrepContent = z.infer<typeof prepContentSchema>;
export type PrepRubric = z.infer<typeof prepRubricSchema>;

/** Structural checks used by admin validate/publish. */
export function validatePrepPackage(content: PrepContent, rubric: PrepRubric): string[] {
  const errors: string[] = [];
  const questionKeys = new Set(content.questions.map((q) => q.key));
  const lessonKeys = new Set(content.lessons.map((l) => l.key));
  const objectiveKeys = new Set(content.objectives.map((o) => o.key));

  for (const lesson of content.lessons) {
    if (!objectiveKeys.has(lesson.objectiveKey)) {
      errors.push(`Lesson ${lesson.key} references missing objective ${lesson.objectiveKey}`);
    }
    for (const key of lesson.questionKeys) {
      if (!questionKeys.has(key)) errors.push(`Lesson ${lesson.key} references missing question ${key}`);
    }
  }
  for (const objective of content.objectives) {
    for (const key of objective.questionKeys) {
      if (!questionKeys.has(key)) errors.push(`Objective ${objective.key} references missing question ${key}`);
    }
  }
  for (const question of content.questions) {
    if (!lessonKeys.has(question.lessonKey)) {
      errors.push(`Question ${question.key} references missing lesson ${question.lessonKey}`);
    }
    if (!objectiveKeys.has(question.objectiveKey)) {
      errors.push(`Question ${question.key} references missing objective ${question.objectiveKey}`);
    }
    if (question.type === 'mcq') {
      if (!question.options?.length) errors.push(`MCQ ${question.key} needs options`);
      if (!rubric.questions[question.key]?.correctOptionId) {
        errors.push(`MCQ ${question.key} needs rubric.correctOptionId`);
      }
    }
  }
  for (const task of content.tasks) {
    const taskRubric = rubric.tasks[task.key];
    const kind = task.evidenceKind ?? taskRubric?.evidenceKind;
    if (task.required && !kind && !taskRubric?.requiresGithub) {
      errors.push(`Required task ${task.key} needs evidenceKind or requiresGithub`);
    }
  }
  for (const resource of content.resources) {
    if (!/^https?:\/\//i.test(resource.url)) {
      errors.push(`Resource URL is invalid: ${resource.url}`);
    }
  }
  return errors;
}

/** Learner payloads never include the rubric object. */
export function toLearnerContent(content: PrepContent): PrepContent {
  return prepContentSchema.parse(content);
}
