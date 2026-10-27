import { scoreAnswers } from '../ai/lesson-check';
import type { PrepContent, PrepRubric } from './package.schema';

export const PASS_LINE = 70;
/** Local scores in this band may get one model second opinion. */
export const SECOND_OPINION_MIN = 45;

export type ScoreResult = {
  score: number;
  passed: boolean;
  feedback: string;
  needsSecondOpinion: boolean;
};

function keywordScore(answer: string, keywords: string[] | undefined, passLine: number): ScoreResult | null {
  if (!keywords?.length) return null;
  const lower = answer.toLowerCase();
  const hits = keywords.filter((word) => lower.includes(word.toLowerCase()));
  const ratio = hits.length / keywords.length;
  const score = Math.round(ratio * 100);
  const passed = score >= passLine;
  return {
    score,
    passed,
    feedback: passed
      ? `Your answer covers ${hits.length} of ${keywords.length} expected ideas.`
      : `Add more concrete detail. Covered ${hits.length} of ${keywords.length} expected ideas.`,
    needsSecondOpinion: !passed && score >= SECOND_OPINION_MIN,
  };
}

export function scoreQuestion(content: PrepContent, rubric: PrepRubric, questionKey: string, answer: string): ScoreResult {
  const question = content.questions.find((q) => q.key === questionKey);
  if (!question) {
    return { score: 0, passed: false, feedback: 'That question is not in this package.', needsSecondOpinion: false };
  }
  const text = answer.trim();
  const line = rubric.passLine || PASS_LINE;
  const entry = rubric.questions[questionKey] ?? {};

  if (question.type === 'mcq') {
    const correct = entry.correctOptionId;
    const passed = Boolean(correct) && text === correct;
    return {
      score: passed ? 100 : 0,
      passed,
      feedback: passed ? 'That option matches the check for real work.' : 'That option does not show the skill in use.',
      needsSecondOpinion: false,
    };
  }

  if (text.length < 12) {
    return {
      score: 0,
      passed: false,
      feedback: 'Write a concrete situation: what goes in, what can go wrong, and how you would check it.',
      needsSecondOpinion: false,
    };
  }

  const fromKeywords = keywordScore(text, entry.keywords, line);
  if (fromKeywords) return fromKeywords;

  if (question.type === 'sql' || question.type === 'code') {
    const hints = entry.testHints ?? [];
    const hitHints = hints.filter((hint) => text.toLowerCase().includes(hint.toLowerCase()));
    if (hints.length) {
      const score = Math.round((hitHints.length / hints.length) * 100);
      return {
        score,
        passed: score >= line,
        feedback: score >= line
          ? 'The answer includes the expected checks.'
          : 'Include the expected query or code patterns for this skill.',
        needsSecondOpinion: false,
      };
    }
  }

  const local = scoreAnswers(
    content.skillName,
    [{ id: questionKey, prompt: question.prompt, rubric: entry.modelAnswer || 'Working explanation, not the skill name repeated.' }],
    [{ id: questionKey, text }],
  );
  const score = local.score;
  const passed = score >= line;
  return {
    score,
    passed,
    feedback: local.feedback,
    needsSecondOpinion: !passed && score >= SECOND_OPINION_MIN && (question.type === 'short' || question.type === 'scenario' || question.type === 'theory'),
  };
}

export function applySecondOpinion(local: ScoreResult, model: { score: number; feedback: string } | null, passLine = PASS_LINE): ScoreResult {
  if (!model) {
    return { ...local, feedback: `${local.feedback} The model check was unavailable, so this used the local reading.`, needsSecondOpinion: false };
  }
  const score = Math.round(Math.max(0, Math.min(100, model.score)));
  return {
    score,
    passed: score >= passLine,
    feedback: model.feedback.slice(0, 500),
    needsSecondOpinion: false,
  };
}
