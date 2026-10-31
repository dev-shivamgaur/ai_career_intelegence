import { PrepPlan, PrepUsageKind } from '../prisma/client';

/** Daily LLM generate/grade caps that differ by FREE vs PAID plan. */
export type PrepLlmLimits = {
  freeGenerates: number;
  freeGrades: number;
  paidGenerates: number;
  paidGrades: number;
  maxInputChars: number;
  maxLessons: number;
};

export function prepLlmLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): PrepLlmLimits {
  const num = (key: string, fallback: number) => {
    const parsed = Number(env[key]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    freeGenerates: num('PREP_FREE_DAILY_GENERATES', 2),
    freeGrades: num('PREP_FREE_DAILY_GRADES', 20),
    paidGenerates: num('PREP_PAID_DAILY_GENERATES', 20),
    paidGrades: num('PREP_PAID_DAILY_GRADES', 200),
    maxInputChars: num('PREP_MAX_INPUT_CHARS', 4000),
    maxLessons: num('PREP_MAX_LESSONS', 8),
  };
}

export function prepLlmLimitFor(plan: PrepPlan, kind: PrepUsageKind, limits: PrepLlmLimits) {
  const paid = plan === PrepPlan.PAID;
  if (kind === PrepUsageKind.GENERATE) return paid ? limits.paidGenerates : limits.freeGenerates;
  return paid ? limits.paidGrades : limits.freeGrades;
}
