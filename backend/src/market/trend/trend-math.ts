export const TREND_METHODOLOGY_VERSION = 'trend-1';

export type TrendLabel = 'INCREASING' | 'DECREASING' | 'EMERGING' | 'STABLE' | 'INSUFFICIENT_DATA';

export type TrendConfig = {
  minPanelCompanies: number;
  minTotalJobs: number;
  minJobCount: number;
  alpha: number;
  confirmSteps: number;
  emergingMaxBaseShare: number;
  emergingMinRelativeGrowth: number;
  emergingMinCompanies: number;
};

/** One skill's capped counts in one period (already on the intersection panel). */
export type PeriodSkillSample = {
  skillId: string;
  cappedJobCount: number;
  cappedTotal: number;
  companyCount: number;
};

export type StepResult = {
  skillId: string;
  share: number;
  priorShare: number;
  effectPp: number;
  relativeGrowth: number | null;
  jobCount: number;
  priorJobCount: number;
  totalJobs: number;
  priorTotalJobs: number;
  companies: number;
  priorCompanies: number;
  z: number | null;
  pValue: number | null;
  /** Set after Benjamini–Hochberg across the career/lane. */
  adjustedPValue: number | null;
  significant: boolean;
  direction: 'UP' | 'DOWN' | 'FLAT';
};

export type SkillTrendDecision = {
  skillId: string;
  label: TrendLabel;
  confirmedSteps: number;
  last: StepResult;
  /** First period share in the confirmation window (for EMERGING). */
  baseShare: number;
};

const EPS = 1e-12;

/** Two-sided p-value of a standard normal |z| (Abramowitz & Stegun 7.1.26). */
export function normalPValue(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const a = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - a * Math.exp(-x * x);
  return Math.max(0, Math.min(1, 1 - erf));
}

/**
 * Two-proportion z-test on capped counts. Returns null z/p when either n is zero.
 * Shares use the capped totals so the company cap already applied in demand carries through.
 */
export function twoProportionZ(successA: number, nA: number, successB: number, nB: number): { z: number; pValue: number } | null {
  if (nA <= 0 || nB <= 0) return null;
  const p1 = Math.min(1, Math.max(0, successA / nA));
  const p2 = Math.min(1, Math.max(0, successB / nB));
  const pooled = (successA + successB) / (nA + nB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB));
  if (se < EPS) return { z: 0, pValue: 1 };
  const z = (p1 - p2) / se;
  return { z, pValue: normalPValue(z) };
}

/** Benjamini–Hochberg FDR control. Input order is preserved; null p-values stay non-significant. */
export function benjaminiHochberg(pValues: Array<number | null>, alpha: number): Array<{ adjusted: number | null; significant: boolean }> {
  const indexed = pValues.map((p, i) => ({ p, i })).filter((x): x is { p: number; i: number } => x.p !== null && Number.isFinite(x.p));
  indexed.sort((a, b) => a.p - b.p);
  const m = indexed.length;
  const adjusted = new Array<number | null>(pValues.length).fill(null);
  const significant = new Array(pValues.length).fill(false);
  let minAdj = 1;
  for (let rank = m; rank >= 1; rank -= 1) {
    const { p, i } = indexed[rank - 1];
    minAdj = Math.min(minAdj, (p * m) / rank);
    adjusted[i] = Math.min(1, minAdj);
  }
  let lastSig = -1;
  for (let rank = 1; rank <= m; rank += 1) {
    const { p, i } = indexed[rank - 1];
    if (p <= (rank / m) * alpha) lastSig = rank;
  }
  for (let rank = 1; rank <= lastSig; rank += 1) significant[indexed[rank - 1].i] = true;
  return adjusted.map((adj, i) => ({ adjusted: adj, significant: significant[i] }));
}

export function compareStep(current: PeriodSkillSample, prior: PeriodSkillSample): StepResult {
  const share = current.cappedTotal > 0 ? current.cappedJobCount / current.cappedTotal : 0;
  const priorShare = prior.cappedTotal > 0 ? prior.cappedJobCount / prior.cappedTotal : 0;
  const effectPp = share - priorShare;
  const relativeGrowth = priorShare > EPS ? effectPp / priorShare : share > EPS ? Infinity : 0;
  const test = twoProportionZ(current.cappedJobCount, current.cappedTotal, prior.cappedJobCount, prior.cappedTotal);
  const direction: StepResult['direction'] = effectPp > EPS ? 'UP' : effectPp < -EPS ? 'DOWN' : 'FLAT';
  return {
    skillId: current.skillId,
    share,
    priorShare,
    effectPp,
    relativeGrowth: Number.isFinite(relativeGrowth) ? relativeGrowth : null,
    jobCount: current.cappedJobCount,
    priorJobCount: prior.cappedJobCount,
    totalJobs: current.cappedTotal,
    priorTotalJobs: prior.cappedTotal,
    companies: current.companyCount,
    priorCompanies: prior.companyCount,
    z: test?.z ?? null,
    pValue: test?.pValue ?? null,
    adjustedPValue: null,
    significant: false,
    direction,
  };
}

/** Applies BH across a step's skills and stamps adjustedPValue / significant. */
export function correctStep(steps: StepResult[], alpha: number): StepResult[] {
  const bh = benjaminiHochberg(
    steps.map((s) => s.pValue),
    alpha,
  );
  return steps.map((s, i) => ({ ...s, adjustedPValue: bh[i].adjusted, significant: bh[i].significant }));
}

function sampleOk(s: PeriodSkillSample, cfg: TrendConfig, panelCompanies: number): boolean {
  return panelCompanies >= cfg.minPanelCompanies && s.cappedTotal >= cfg.minTotalJobs && s.cappedJobCount >= cfg.minJobCount;
}

/**
 * Decide labels for every skill at the end of a confirmation window.
 * `steps` is oldest→newest, length === confirmSteps; each entry is BH-corrected for that pairwise step.
 * `base` is the skill sample in the first period of the window (for EMERGING).
 */
export function decideLabels(
  steps: StepResult[][],
  baseBySkill: Map<string, PeriodSkillSample>,
  panelCompanies: number,
  cfg: TrendConfig,
): SkillTrendDecision[] {
  if (steps.length !== cfg.confirmSteps) {
    throw new Error(`expected ${cfg.confirmSteps} steps, got ${steps.length}`);
  }
  const last = steps[steps.length - 1];
  const bySkill = new Map(last.map((s) => [s.skillId, s]));
  for (const step of steps) for (const s of step) if (!bySkill.has(s.skillId)) bySkill.set(s.skillId, s);

  const out: SkillTrendDecision[] = [];
  for (const [skillId, lastStep] of bySkill) {
    const trail = steps.map((step) => step.find((s) => s.skillId === skillId) ?? null);
    const base = baseBySkill.get(skillId) ?? {
      skillId,
      cappedJobCount: 0,
      cappedTotal: lastStep.priorTotalJobs,
      companyCount: 0,
    };
    const baseShare = base.cappedTotal > 0 ? base.cappedJobCount / base.cappedTotal : 0;
    const lastOk = sampleOk(
      { skillId, cappedJobCount: lastStep.jobCount, cappedTotal: lastStep.totalJobs, companyCount: lastStep.companies },
      cfg,
      panelCompanies,
    );
    const priorOk = sampleOk(
      { skillId, cappedJobCount: lastStep.priorJobCount, cappedTotal: lastStep.priorTotalJobs, companyCount: lastStep.priorCompanies },
      cfg,
      panelCompanies,
    );
    if (!lastOk || !priorOk) {
      out.push({ skillId, label: 'INSUFFICIENT_DATA', confirmedSteps: 0, last: lastStep, baseShare });
      continue;
    }

    const dir = lastStep.direction;
    let confirmed = 0;
    if (lastStep.significant && dir !== 'FLAT') {
      confirmed = 1;
      for (let i = steps.length - 2; i >= 0; i -= 1) {
        const s = trail[i];
        if (s && s.significant && s.direction === dir) confirmed += 1;
        else break;
      }
    }

    const rel =
      lastStep.relativeGrowth ??
      (baseShare > EPS ? (lastStep.share - baseShare) / baseShare : lastStep.share > EPS ? Infinity : 0);
    const emerging =
      baseShare < cfg.emergingMaxBaseShare &&
      rel >= cfg.emergingMinRelativeGrowth &&
      lastStep.companies >= cfg.emergingMinCompanies &&
      lastStep.significant &&
      dir === 'UP';

    let label: TrendLabel = 'STABLE';
    if (emerging) label = 'EMERGING';
    else if (confirmed >= cfg.confirmSteps && dir === 'UP') label = 'INCREASING';
    else if (confirmed >= cfg.confirmSteps && dir === 'DOWN') label = 'DECREASING';

    out.push({ skillId, label, confirmedSteps: confirmed, last: lastStep, baseShare });
  }
  return out.sort((a, b) => a.skillId.localeCompare(b.skillId));
}

export const round6 = (x: number) => Math.round(x * 1_000_000) / 1_000_000;
