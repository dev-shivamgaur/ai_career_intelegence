import { PrepPlan, PrepUsageKind } from '../prisma/client';
import { prepLlmLimitFor, prepLlmLimitsFromEnv, type PrepLlmLimits } from '../paid/prep-llm-limits';

/** @deprecated Prefer PrepLlmLimits from paid/ — kept as alias for preparation callers. */
export type PrepLimits = PrepLlmLimits;

export function prepLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): PrepLimits {
  return prepLlmLimitsFromEnv(env);
}

export function limitFor(plan: PrepPlan, kind: PrepUsageKind, limits: PrepLimits) {
  return prepLlmLimitFor(plan, kind, limits);
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
