import { PrepPlan } from '../prisma/client';

export type AccountPlanLimits = {
  freeResumeUploads: number;
  paidResumeUploads: number;
};

export function accountPlanLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): AccountPlanLimits {
  const num = (key: string, fallback: number) => {
    const parsed = Number(env[key]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    freeResumeUploads: num('FREE_RESUME_UPLOADS', 5),
    paidResumeUploads: num('PAID_RESUME_UPLOADS', 100),
  };
}

export function resumeUploadLimit(plan: PrepPlan, limits = accountPlanLimitsFromEnv()) {
  return plan === PrepPlan.PAID ? limits.paidResumeUploads : limits.freeResumeUploads;
}

export type ResumeQuotaView = {
  plan: PrepPlan;
  used: number;
  limit: number;
  remaining: number;
  warnAtRemaining: number;
  isPaid: boolean;
  blocked: boolean;
};

export function resumeQuotaView(plan: PrepPlan, used: number): ResumeQuotaView {
  const limit = resumeUploadLimit(plan);
  const remaining = Math.max(0, limit - used);
  return {
    plan,
    used,
    limit,
    remaining,
    warnAtRemaining: 3,
    isPaid: plan === PrepPlan.PAID,
    blocked: remaining <= 0 && plan === PrepPlan.FREE,
  };
}
