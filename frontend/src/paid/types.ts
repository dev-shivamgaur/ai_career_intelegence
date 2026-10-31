export type AccountPlan = "FREE" | "PAID" | string;

export type ResumeQuota = {
  plan: AccountPlan;
  used: number;
  limit: number;
  remaining: number;
  warnAtRemaining: number;
  isPaid: boolean;
  blocked: boolean;
};
