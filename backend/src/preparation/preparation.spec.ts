import { NotFoundException } from '@nestjs/common';
import { requireOwnedSession } from './access';
import { buildDeterministicPackage, choosePackageSource, findIdempotentAttempt, hashPackage } from './package-builder';
import { gradeSchema, prepContentSchema, toLearnerContent, validatePrepPackage } from './package.schema';
import { PASS_LINE, scoreQuestion } from './scorer';
import { deriveProgress } from './status';
import { selectTasksForApply } from './apply-tasks';
import { assertCan, prepQuotaKey, withinQuota } from './quota';
import { TaskStatus } from '../prisma/client';
import { roadmapTaskPatch } from '../roadmap/task-patch';
import { promptingTechniquesPackage, ragPackage } from './seed-packages';
import {
  buildVersionInfo,
  pickLatestPublished,
  resolveTargetPackageId,
  shouldAbandonForSwitch,
} from './version-switch';

const built = buildDeterministicPackage({
  skillId: 'skill-1',
  skillName: 'Indexing',
  careerTitle: 'Backend Developer',
  prerequisites: [],
  resources: [{ title: 'Docs', url: 'https://example.com/docs', kind: 'DOC' }],
  dailyHours: 2,
  phase: 'D30',
});

const conceptual = buildDeterministicPackage({
  skillId: 'skill-2',
  skillName: 'Prompting Techniques',
  careerTitle: 'AI Engineer',
  prerequisites: [],
  resources: [],
  dailyHours: 1,
  phase: 'D30',
  conceptual: true,
});

describe('preparation version switch', () => {
  const rows = [
    { id: 'p1', version: 1, status: 'PUBLISHED' },
    { id: 'p2', version: 2, status: 'PUBLISHED' },
    { id: 'd3', version: 3, status: 'DRAFT' },
  ];

  it('defaults to the latest published package', () => {
    expect(pickLatestPublished(rows.filter((r) => r.status === 'PUBLISHED'))?.id).toBe('p2');
    expect(resolveTargetPackageId(rows, {})).toEqual({ packageId: 'p2', version: 2 });
  });

  it('resolves an explicit published version and rejects drafts', () => {
    expect(resolveTargetPackageId(rows, { packageVersion: 1 })).toEqual({ packageId: 'p1', version: 1 });
    expect(resolveTargetPackageId(rows, { packageId: 'd3' })).toEqual({ error: 'NOT_PUBLISHED' });
  });

  it('abandons only when switching to a different package', () => {
    expect(shouldAbandonForSwitch('p1', 'p2', true)).toBe(true);
    expect(shouldAbandonForSwitch('p1', 'p1', true)).toBe(false);
    expect(shouldAbandonForSwitch('p1', 'p2', false)).toBe(false);
  });

  it('marks upgradeAvailable when latest is ahead of current', () => {
    expect(buildVersionInfo(1, 'p1', 2, 'p2')).toMatchObject({
      current: 1,
      latest: 2,
      upgradeAvailable: true,
    });
    expect(buildVersionInfo(2, 'p2', 2, 'p2').upgradeAvailable).toBe(false);
  });
});

describe('preparation package', () => {
  it('keeps the rubric off the learner payload', () => {
    const learner = toLearnerContent(built.content);
    expect(JSON.stringify(learner)).not.toContain('correctOptionId');
    expect(learner.resources[0].verified).toBe(true);
    expect(learner.dailyHours).toBe(2);
    expect(learner.schemaVersion).toBe(2);
  });

  it('reuses a published package and falls back when quota is exhausted', () => {
    expect(choosePackageSource(true, true, true)).toBe('reuse');
    expect(choosePackageSource(false, true, false)).toBe('quota-fallback');
    expect(choosePackageSource(false, false, true)).toBe('deterministic');
  });

  it('builds conceptual packages without required practical tasks', () => {
    expect(conceptual.content.tasks).toEqual([]);
    const attempts = conceptual.content.questions.map((q, index) => ({
      questionKey: q.key,
      score: 100,
      passed: true,
      attemptNumber: index + 1,
    }));
    const progress = deriveProgress(conceptual.content, attempts, [], 70);
    expect(progress.status).toBe('VERIFIED');
    expect(progress.practicalRequired).toBe(0);
  });

  it('validates rich seed packages', () => {
    const prompting = promptingTechniquesPackage('skill-prompt');
    const rag = ragPackage('skill-rag');
    expect(validatePrepPackage(prompting.content, prompting.rubric)).toEqual([]);
    expect(validatePrepPackage(rag.content, rag.rubric)).toEqual([]);
    expect(prompting.content.tasks).toHaveLength(0);
    expect(rag.content.tasks.length).toBeGreaterThan(0);
  });

  it('changes contentHash when content changes', () => {
    const next = { ...built.content, completionSummary: 'changed summary for hash' };
    expect(hashPackage(next, built.rubric)).not.toBe(built.contentHash);
  });
});

describe('preparation scoring and history', () => {
  it('scores a multiple-choice question in code', () => {
    const pass = scoreQuestion(built.content, built.rubric, 'q-proof', 'artefact');
    const fail = scoreQuestion(built.content, built.rubric, 'q-proof', 'definition');
    expect(pass).toMatchObject({ score: 100, passed: true, needsSecondOpinion: false });
    expect(fail.passed).toBe(false);
    expect(built.rubric.passLine).toBe(PASS_LINE);
  });

  it('scores scenario answers with rubric keywords', () => {
    const prompting = promptingTechniquesPackage('skill-prompt');
    const result = scoreQuestion(
      prompting.content,
      prompting.rubric,
      'q-scenario-1',
      'Require JSON keys and forbid markdown fences so the format stays parseable.',
    );
    expect(result.passed).toBe(true);
  });

  it('returns the stored attempt for a repeated idempotency key and does not add another row', () => {
    const rows = [{ idempotencyKey: 'same', score: 100 }];
    const first = findIdempotentAttempt(rows, 'same');
    const inserted = first ? rows : [...rows, { idempotencyKey: 'same', score: 0 }];
    expect(inserted).toHaveLength(1);
    expect(findIdempotentAttempt(inserted, 'same')?.score).toBe(100);
  });

  it('can reach verified from attempts and a practical task without a roadmap write', () => {
    const attempts = built.content.questions.map((q, index) => ({
      questionKey: q.key,
      score: 100,
      passed: true,
      attemptNumber: index + 1,
    }));
    const progress = deriveProgress(built.content, attempts, [{ taskKey: 'github-proof', verified: true }], 70);
    expect(progress.status).toBe('VERIFIED');
    expect(progress.assessmentScore).toBe(100);
    expect(progress.questionsCorrect).toBe(attempts.length);
    expect(progress).not.toHaveProperty('roadmapTasks');
  });

  it('stays in progress when only the lesson was answered and the practical task is missing', () => {
    const attempts = built.content.questions.map((q) => ({ questionKey: q.key, score: 40, passed: false, attemptNumber: 1 }));
    const progress = deriveProgress(built.content, attempts, [], 70);
    expect(progress.status).toBe('NEEDS_PRACTICE');
    expect(progress.lessonCompleted).toBe(1);
    expect(progress.practicalVerified).toBe(0);
  });

  it('surfaces NEEDS_PRACTICE so the learner can resume without a new package', () => {
    const attempts = built.content.questions.map((q) => ({ questionKey: q.key, score: 40, passed: false, attemptNumber: 1 }));
    const progress = deriveProgress(built.content, attempts, [], 70);
    expect(progress.status).toBe('NEEDS_PRACTICE');
    expect(progress.nextAction).toMatch(/Practice again|Submit the practical/i);
  });
});

describe('preparation apply and quota', () => {
  it('completes only the opened phase and ignores other phases', () => {
    const tasks = [
      { id: 'd7', relatedSkill: 'Indexing', title: 'Indexing', phase: 'D7' },
      { id: 'd30', relatedSkill: 'Indexing', title: 'Indexing', phase: 'D30' },
    ];
    expect(selectTasksForApply(tasks, 'Indexing', { id: 'd7', phase: 'D7' })).toEqual(['d7']);
    expect(selectTasksForApply(tasks, 'Indexing', null)).toEqual([]);
    expect(selectTasksForApply(tasks, 'Indexing', { id: 'other', phase: 'D7' })).toEqual([]);
  });

  it('uses a preparation quota key that is not the market budget', () => {
    expect(prepQuotaKey('user-1', 'GRADE' as never, new Date('2026-10-22T00:00:00.000Z'))).toBe('prep:llm:user-1:GRADE:2026-10-22');
    expect(prepQuotaKey('user-1', 'GRADE' as never)).not.toContain('market:llm');
    expect(withinQuota(21, 20)).toBe(false);
    expect(withinQuota(20, 20)).toBe(true);
    expect(() => assertCan(21, 20)).toThrow('PREP_QUOTA');
    expect(() => assertCan(20, 20)).not.toThrow();
  });

  it('rejects model output that does not match the grade schema', () => {
    expect(() => gradeSchema.parse({ score: 140, passed: true, feedback: 'too high' })).toThrow();
    expect(() => prepContentSchema.parse({ skillId: 'only-an-id' })).toThrow();
  });

  it('returns 404 when the session belongs to someone else', () => {
    expect(() => requireOwnedSession({ userId: 'owner' }, 'other')).toThrow(NotFoundException);
    try {
      requireOwnedSession({ userId: 'owner' }, 'other');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getStatus()).toBe(404);
      expect((err as NotFoundException).getResponse()).toMatchObject({ error: 'PREP_SESSION_NOT_FOUND' });
    }
    expect(requireOwnedSession({ userId: 'owner', id: 's1' }, 'owner').id).toBe('s1');
  });

  it('skip and add note only write status and note', () => {
    expect(roadmapTaskPatch({ status: TaskStatus.SKIPPED })).toEqual({ status: TaskStatus.SKIPPED });
    expect(roadmapTaskPatch({ note: 'later' })).toEqual({ note: 'later' });
    expect(Object.keys(roadmapTaskPatch({ status: TaskStatus.SKIPPED, note: 'later' })).sort()).toEqual(['note', 'status']);
  });

  it('flags publish validation when MCQ lacks a correct option', () => {
    const broken = structuredClone(built.content);
    const rubric = structuredClone(built.rubric);
    delete rubric.questions['q-proof'].correctOptionId;
    const errors = validatePrepPackage(broken, rubric);
    expect(errors.some((e) => e.includes('correctOptionId'))).toBe(true);
  });
});
