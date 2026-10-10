import { capJobs, companyWeights, computeDemand, periodEnd, periodStart, recentPeriods, wilson } from './demand-math';

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('period buckets', () => {
  it('ISO weeks start on Monday (UTC) and months on the 1st', () => {
    expect(iso(periodStart('WEEK', new Date('2026-10-09T15:00:00Z')))).toBe('2026-10-05');
    expect(iso(periodStart('WEEK', new Date('2026-10-05T00:00:00Z')))).toBe('2026-10-05');
    expect(iso(periodStart('WEEK', new Date('2026-10-04T23:59:59Z')))).toBe('2026-09-28');
    expect(iso(periodStart('MONTH', new Date('2026-10-31T23:00:00Z')))).toBe('2026-10-01');
    expect(iso(periodEnd('MONTH', new Date('2026-12-01T00:00:00Z')))).toBe('2027-01-01');
  });

  it('recent periods are contiguous, never overlap, and only the last is open', () => {
    for (const type of ['WEEK', 'MONTH'] as const) {
      const ps = recentPeriods(type, new Date('2026-10-09T12:00:00Z'), 6);
      expect(ps).toHaveLength(6);
      for (let i = 1; i < ps.length; i += 1) expect(ps[i].start.getTime()).toBe(ps[i - 1].end.getTime());
      expect(ps.map((p) => p.isComplete)).toEqual([true, true, true, true, true, false]);
    }
  });

  it('a timestamp falls in exactly one bucket', () => {
    const t = new Date('2026-09-30T23:59:59Z');
    const hits = recentPeriods('WEEK', new Date('2026-10-20T00:00:00Z'), 8).filter((p) => p.start <= t && t < p.end);
    expect(hits).toHaveLength(1);
  });
});

describe('company cap', () => {
  it('caps each company at ceil(share * total) jobs', () => {
    expect(capJobs(100, 0.2)).toBe(20);
    expect(capJobs(3, 0.2)).toBe(1);
    expect(capJobs(0, 0.2)).toBe(1);
    const w = companyWeights(new Map([['a', 50], ['b', 10]]), 12);
    expect(w.get('a')).toBeCloseTo(0.24);
    expect(w.get('b')).toBe(1);
  });

  it('one company flooding the data cannot dominate a share', () => {
    const perCompany = new Map([['big', 80], ...Array.from({ length: 8 }, (_, i) => [`c${i}`, 5] as [string, number])]);
    const rows = [
      { skillId: 'kafka', companyId: 'big', jobs: 80, required: 80, preferred: 0, nice: 0 },
      ...Array.from({ length: 8 }, (_, i) => ({ skillId: 'sql', companyId: `c${i}`, jobs: 5, required: 5, preferred: 0, nice: 0 })),
    ];
    const d = computeDemand(perCompany, rows, 0.2);
    expect(d.totalJobs).toBe(120);
    expect(d.capJobs).toBe(24);
    expect(d.cappedTotal).toBe(64);
    const kafka = d.skills.find((s) => s.skillId === 'kafka')!;
    const sql = d.skills.find((s) => s.skillId === 'sql')!;
    expect(kafka.jobCount).toBe(80);
    expect(kafka.cappedJobCount).toBe(24);
    expect(kafka.demandPct).toBe(0.375);
    expect(sql.demandPct).toBe(0.625);
    expect(kafka.companyCount).toBe(1);
    expect(sql.companyCount).toBe(8);
  });
});

describe('Wilson interval', () => {
  it('matches the textbook value and stays inside [0, 1]', () => {
    const ci = wilson(10, 100);
    expect(ci.lower).toBeCloseTo(0.0552, 3);
    expect(ci.upper).toBeCloseTo(0.1744, 3);
    expect(wilson(0, 10).lower).toBe(0);
    expect(wilson(10, 10).upper).toBe(1);
    expect(wilson(0, 0)).toEqual({ lower: 0, upper: 0 });
  });

  it('narrows as n grows for the same share', () => {
    const small = wilson(5, 20);
    const large = wilson(50, 200);
    expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower);
  });
});
