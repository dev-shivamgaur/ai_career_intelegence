export const DEMAND_METHODOLOGY_VERSION = 'demand-1';

export type PeriodType = 'WEEK' | 'MONTH';
export type Period = { type: PeriodType; start: Date; end: Date; isComplete: boolean };

const DAY = 24 * 60 * 60 * 1000;

/** Period buckets are UTC calendar ISO weeks (Monday 00:00) and calendar months. Buckets never overlap. */
export function periodStart(type: PeriodType, at: Date): Date {
  if (type === 'MONTH') return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const day = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  const isoDow = (new Date(day).getUTCDay() + 6) % 7;
  return new Date(day - isoDow * DAY);
}

export function periodEnd(type: PeriodType, start: Date): Date {
  if (type === 'MONTH') return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return new Date(start.getTime() + 7 * DAY);
}

/** The current (open) period plus the `count - 1` periods before it, oldest first. */
export function recentPeriods(type: PeriodType, now: Date, count: number): Period[] {
  const out: Period[] = [];
  let start = periodStart(type, now);
  for (let i = 0; i < count; i += 1) {
    const end = periodEnd(type, start);
    out.unshift({ type, start, end, isComplete: end.getTime() <= now.getTime() });
    start = periodStart(type, new Date(start.getTime() - DAY));
  }
  return out;
}

/** The most jobs any one company may contribute to a population of `totalJobs`. */
export function capJobs(totalJobs: number, capShare: number): number {
  return Math.max(1, Math.ceil(capShare * totalJobs));
}

/** Weight of each company's jobs: min(1, cap / companyJobs). A company above the cap counts as exactly `cap` jobs. */
export function companyWeights(jobsPerCompany: Map<string, number>, cap: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const [company, n] of jobsPerCompany) out.set(company, n > 0 ? Math.min(1, cap / n) : 0);
  return out;
}

/** 95% Wilson score interval for `successes` out of `n` (both may be fractional after capping). */
export function wilson(successes: number, n: number, z = 1.96): { lower: number; upper: number } {
  if (n <= 0) return { lower: 0, upper: 0 };
  const p = Math.min(1, Math.max(0, successes / n));
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { lower: Math.max(0, (centre - margin) / denom), upper: Math.min(1, (centre + margin) / denom) };
}

export const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

export type SkillCompanyRow = { skillId: string; companyId: string; jobs: number; required: number; preferred: number; nice: number };

export type SkillDemand = {
  skillId: string;
  jobCount: number;
  requiredCount: number;
  preferredCount: number;
  niceCount: number;
  companyCount: number;
  cappedJobCount: number;
  demandPct: number;
  wilsonLower: number;
  wilsonUpper: number;
};

/** Applies the company cap to a population and its per-skill counts. Pure, so tests and SQL checks can reproduce it. */
export function computeDemand(jobsPerCompany: Map<string, number>, rows: SkillCompanyRow[], capShare: number) {
  const totalJobs = [...jobsPerCompany.values()].reduce((a, b) => a + b, 0);
  const cap = capJobs(totalJobs, capShare);
  const weights = companyWeights(jobsPerCompany, cap);
  const cappedTotal = [...jobsPerCompany.entries()].reduce((a, [c, n]) => a + n * (weights.get(c) ?? 0), 0);
  const bySkill = new Map<string, SkillDemand & { companies: Set<string> }>();
  for (const r of rows) {
    const s =
      bySkill.get(r.skillId) ??
      { skillId: r.skillId, jobCount: 0, requiredCount: 0, preferredCount: 0, niceCount: 0, companyCount: 0, cappedJobCount: 0, demandPct: 0, wilsonLower: 0, wilsonUpper: 0, companies: new Set<string>() };
    s.jobCount += r.jobs;
    s.requiredCount += r.required;
    s.preferredCount += r.preferred;
    s.niceCount += r.nice;
    s.cappedJobCount += r.jobs * (weights.get(r.companyId) ?? 0);
    s.companies.add(r.companyId);
    bySkill.set(r.skillId, s);
  }
  const skills: SkillDemand[] = [...bySkill.values()]
    .map(({ companies, ...s }) => {
      const ci = wilson(s.cappedJobCount, cappedTotal);
      return {
        ...s,
        companyCount: companies.size,
        cappedJobCount: round4(s.cappedJobCount),
        demandPct: cappedTotal ? round4(s.cappedJobCount / cappedTotal) : 0,
        wilsonLower: round4(ci.lower),
        wilsonUpper: round4(ci.upper),
      };
    })
    .sort((a, b) => b.cappedJobCount - a.cappedJobCount || a.skillId.localeCompare(b.skillId));
  return { totalJobs, cappedTotal: round4(cappedTotal), companyCount: jobsPerCompany.size, capJobs: cap, skills };
}
