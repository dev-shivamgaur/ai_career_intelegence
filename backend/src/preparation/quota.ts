import { PrepPlan, PrepUsageKind } from '../prisma/client';

export type PrepLimits = {
  freeGenerates: number;
  freeGrades: number;
  paidGenerates: number;
  paidGrades: number;
  maxInputChars: number;
  maxLessons: number;
};

export function prepLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): PrepLimits {
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

export function limitFor(plan: PrepPlan, kind: PrepUsageKind, limits: PrepLimits) {
  const paid = plan === PrepPlan.PAID;
  if (kind === PrepUsageKind.GENERATE) return paid ? limits.paidGenerates : limits.freeGenerates;
  return paid ? limits.paidGrades : limits.freeGrades;
}

export function prepQuotaKey(userId: string, kind: PrepUsageKind, now = new Date()) {
  return `prep:llm:${userId}:${kind}:${now.toISOString().slice(0, 10)}`;
}

export function withinQuota(used: number, limit: number) {
  return used <= limit;
}

/** One entitlement check for generate, grade, and hint. Over the plan limit throws. */
export function assertCan(used: number, limit: number): void {
  if (!withinQuota(used, limit)) {
    throw new Error('PREP_QUOTA');
  }
}
