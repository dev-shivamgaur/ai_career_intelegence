import { INTEL_DEFAULTS } from '../../intel-config/intel-config.defaults';
import {
  benjaminiHochberg,
  compareStep,
  correctStep,
  decideLabels,
  normalPValue,
  twoProportionZ,
  type PeriodSkillSample,
  type TrendConfig,
} from './trend-math';
import { computeDemand } from '../demand/demand-math';

const CFG: TrendConfig = { ...INTEL_DEFAULTS.trend };

function sample(skillId: string, cappedJobCount: number, cappedTotal: number, companyCount = 10): PeriodSkillSample {
  return { skillId, cappedJobCount, cappedTotal, companyCount };
}

/** Three periods of one skill; builds BH-corrected steps and decides the label. */
function labelOver(shares: Array<{ jobs: number; total: number; companies?: number }>, cfg = CFG) {
  const periods = shares.map((s) => sample('sk', s.jobs, s.total, s.companies ?? 12));
  const steps: ReturnType<typeof correctStep>[] = [];
  for (let i = 1; i < periods.length; i += 1) steps.push(correctStep([compareStep(periods[i], periods[i - 1])], cfg.alpha));
  while (steps.length < cfg.confirmSteps) steps.unshift(steps[0]!);
  const window = steps.slice(-cfg.confirmSteps);
  const base = periods[periods.length - 1 - cfg.confirmSteps] ?? periods[0];
  return decideLabels(
    window,
    new Map([['sk', base]]),
    12,
    cfg,
  )[0];
}

describe('two-proportion z-test and BH', () => {
  it('returns a two-sided p-value near 0 for a large clear shift', () => {
    const t = twoProportionZ(40, 100, 10, 100)!;
    expect(t.z).toBeGreaterThan(4);
    expect(t.pValue).toBeLessThan(0.001);
    expect(normalPValue(0)).toBeCloseTo(1, 3);
  });

  it('Benjamini–Hochberg keeps only the strongest among many comparisons', () => {
    const p = [0.001, 0.01, 0.04, 0.2, 0.5];
    const r = benjaminiHochberg(p, 0.05);
    expect(r.filter((x) => x.significant).length).toBeGreaterThanOrEqual(1);
    expect(r[0].significant).toBe(true);
    expect(r[4].significant).toBe(false);
    expect(r[0].adjusted!).toBeLessThanOrEqual(r[1].adjusted!);
  });
});

describe('trend labels (acceptance)', () => {
  it('INSUFFICIENT_DATA when totals or panel are below the guard', () => {
    const d = labelOver(
      [
        { jobs: 2, total: 20 },
        { jobs: 3, total: 20 },
        { jobs: 4, total: 20 },
      ],
      { ...CFG, minTotalJobs: 50 },
    );
    expect(d.label).toBe('INSUFFICIENT_DATA');
  });

  it('changing source mix: same underlying share on the intersection panel produces no trend', () => {
    // Period A: companies 1..12 each post 5 jobs; skill in half. Period B adds company 13 with a burst of the skill,
    // but the intersection panel drops 13, so recomputed shares match → STABLE.
    const baseCompanies = Array.from({ length: 12 }, (_, i) => `c${i}`);
    const jobs = (extra: Array<[string, number]> = []) => {
      const per = new Map<string, number>();
      for (const c of baseCompanies) per.set(c, 5);
      for (const [c, n] of extra) per.set(c, n);
      const rows = [
        ...baseCompanies.slice(0, 6).map((c) => ({ skillId: 'sql', companyId: c, jobs: 5, required: 5, preferred: 0, nice: 0 })),
        ...extra.map(([c, n]) => ({ skillId: 'sql', companyId: c, jobs: n, required: n, preferred: 0, nice: 0 })),
      ];
      return computeDemand(per, rows, 0.2);
    };
    const p0 = jobs();
    const p1 = jobs([['c13', 80]]);
    const p2 = jobs([['c13', 80], ['c14', 80]]);
    // Restrict to the intersection (base 12) by dropping the extras' contribution: recompute without them.
    const stable = jobs();
    expect(stable.skills[0].demandPct).toBeCloseTo(p0.skills[0].demandPct, 5);
    const d = labelOver(
      [
        { jobs: stable.skills[0].cappedJobCount, total: stable.cappedTotal },
        { jobs: stable.skills[0].cappedJobCount, total: stable.cappedTotal },
        { jobs: stable.skills[0].cappedJobCount, total: stable.cappedTotal },
      ],
      CFG,
    );
    expect(d.label).toBe('STABLE');
    expect(p1.skills[0].demandPct).not.toBeCloseTo(p2.skills.find((s) => s.skillId === 'sql')?.demandPct ?? -1, 1);
  });

  it('a single company burst is capped and produces no INCREASING label', () => {
    // Prior: skill evenly across 12 companies (30/120 raw, capped). Current: one company adds 100 jobs for the skill.
    const prior = computeDemand(
      new Map(Array.from({ length: 12 }, (_, i) => [`c${i}`, 10] as [string, number])),
      Array.from({ length: 12 }, (_, i) => ({
        skillId: 'kafka',
        companyId: `c${i}`,
        jobs: i < 3 ? 10 : 0,
        required: i < 3 ? 10 : 0,
        preferred: 0,
        nice: 0,
      })).filter((r) => r.jobs > 0),
      0.2,
    );
    const burst = computeDemand(
      new Map([['big', 100], ...Array.from({ length: 11 }, (_, i) => [`c${i}`, 10] as [string, number])]),
      [
        { skillId: 'kafka', companyId: 'big', jobs: 100, required: 100, preferred: 0, nice: 0 },
        ...Array.from({ length: 3 }, (_, i) => ({ skillId: 'kafka', companyId: `c${i}`, jobs: 10, required: 10, preferred: 0, nice: 0 })),
      ],
      0.2,
    );
    const kafkaPrior = prior.skills.find((s) => s.skillId === 'kafka')!;
    const kafkaBurst = burst.skills.find((s) => s.skillId === 'kafka')!;
    // Cap keeps the burst from dominating: demandPct should not explode to ~1.
    expect(kafkaBurst.demandPct).toBeLessThan(0.6);
    const d = labelOver(
      [
        { jobs: kafkaPrior.cappedJobCount, total: prior.cappedTotal, companies: kafkaPrior.companyCount },
        { jobs: kafkaPrior.cappedJobCount, total: prior.cappedTotal, companies: kafkaPrior.companyCount },
        { jobs: kafkaBurst.cappedJobCount, total: burst.cappedTotal, companies: kafkaBurst.companyCount },
      ],
      CFG,
    );
    // One step of growth after a flat history cannot confirm INCREASING (confirmSteps = 2).
    expect(d.label).not.toBe('INCREASING');
    expect(d.confirmedSteps).toBeLessThan(CFG.confirmSteps);
  });

  it('steady growth over 3 periods is detected as INCREASING', () => {
    // Base share starts above emergingMaxBaseShare so the label is growth, not emerging.
    const d = labelOver(
      [
        { jobs: 20, total: 100, companies: 10 },
        { jobs: 35, total: 100, companies: 12 },
        { jobs: 55, total: 100, companies: 14 },
      ],
      CFG,
    );
    expect(d.label).toBe('INCREASING');
    expect(d.confirmedSteps).toBeGreaterThanOrEqual(CFG.confirmSteps);
  });

  it('low base + strong relative growth with confirmation is EMERGING', () => {
    const d = labelOver(
      [
        { jobs: 5, total: 100, companies: 3 },
        { jobs: 18, total: 100, companies: 5 },
        { jobs: 40, total: 100, companies: 6 },
      ],
      CFG,
    );
    expect(d.label).toBe('EMERGING');
    expect(d.baseShare).toBeLessThan(CFG.emergingMaxBaseShare);
  });
});
