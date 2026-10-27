export const READINESS_FORMULA = '0.7 * requiredCoverage + 0.3 * foundationCoverage';
export const READINESS_NOTE =
  'Estimated preparedness from required skills and prerequisites you have support or verification for. Not a job or interview probability.';

export const MARKET_TIE_MIN_JOBS = 50;
export const MARKET_TIE_MIN_COMPANIES = 10;

export type GapRow = {
  skillId: string;
  name: string;
  importance: string;
  type: string;
  blocked: boolean;
  demandPct: number | null;
};

const rank = (status: string | null | undefined) => (status === 'SUPPORTED' || status === 'VERIFIED' ? 1 : 0);

export function isMet(status: string | null | undefined) {
  return rank(status) === 1;
}

export function readinessScore(requiredMet: number, requiredTotal: number, foundationMet: number, foundationTotal: number) {
  const requiredCoverage = requiredTotal === 0 ? 0 : requiredMet / requiredTotal;
  const foundationCoverage = foundationTotal === 0 ? 1 : foundationMet / foundationTotal;
  const score = 0.7 * requiredCoverage + 0.3 * foundationCoverage;
  return {
    score: Math.round(score * 1000) / 1000,
    requiredCoverage,
    foundationCoverage,
    requiredMet,
    requiredTotal,
    foundationMet,
    foundationTotal,
    formula: READINESS_FORMULA,
    note: READINESS_NOTE,
  };
}

/** Importance, then unblocked skills, then market share only when the snapshot is large enough. */
export function orderGaps(rows: GapRow[], marketEligible: boolean): GapRow[] {
  const weight = (row: GapRow) => (row.type === 'REQUIRED' || row.importance === 'HIGH' ? 0 : 1);
  return [...rows].sort((a, b) => {
    const byImportance = weight(a) - weight(b);
    if (byImportance !== 0) return byImportance;
    const byBlock = Number(a.blocked) - Number(b.blocked);
    if (byBlock !== 0) return byBlock;
    if (!marketEligible) return a.name.localeCompare(b.name);
    return (b.demandPct ?? -1) - (a.demandPct ?? -1) || a.name.localeCompare(b.name);
  });
}

export function marketTieBreakAllowed(totalJobs: number, companies: number) {
  return totalJobs >= MARKET_TIE_MIN_JOBS && companies >= MARKET_TIE_MIN_COMPANIES;
}
