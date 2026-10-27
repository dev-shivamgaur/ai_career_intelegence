import { marketTieBreakAllowed, orderGaps, readinessScore } from './readiness-math';

describe('readinessScore', () => {
  it('does not use market demand', () => {
    const score = readinessScore(1, 2, 1, 1);
    expect(score.score).toBeCloseTo(0.7 * 0.5 + 0.3 * 1);
    expect(score.formula).not.toContain('demand');
    expect(JSON.stringify(score)).not.toContain('demandPct');
  });

  it('treats an empty foundation list as covered', () => {
    expect(readinessScore(2, 2, 0, 0).score).toBeCloseTo(1);
  });
});

describe('orderGaps', () => {
  const rows = [
    { skillId: 'k', name: 'Kubernetes', importance: 'LOW', type: 'NICE_TO_HAVE', blocked: false, demandPct: 0.9 },
    { skillId: 'd', name: 'Docker', importance: 'HIGH', type: 'REQUIRED', blocked: false, demandPct: 0.1 },
    { skillId: 'p', name: 'PostgreSQL', importance: 'HIGH', type: 'REQUIRED', blocked: true, demandPct: 0.8 },
  ];

  it('keeps required skills ahead of a popular optional skill', () => {
    expect(orderGaps(rows, true).map((r) => r.name)).toEqual(['Docker', 'PostgreSQL', 'Kubernetes']);
  });

  it('ignores demand when the snapshot is too small', () => {
    expect(marketTieBreakAllowed(1, 1)).toBe(false);
    const tied = [
      { skillId: 'b', name: 'Beta', importance: 'HIGH', type: 'REQUIRED', blocked: false, demandPct: 0.99 },
      { skillId: 'a', name: 'Alpha', importance: 'HIGH', type: 'REQUIRED', blocked: false, demandPct: 0.01 },
    ];
    expect(orderGaps(tied, false).map((r) => r.name)).toEqual(['Alpha', 'Beta']);
  });
});
