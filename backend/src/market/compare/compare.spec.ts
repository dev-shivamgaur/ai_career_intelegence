import { compareRoadmapMarket, inMarket, isMismatch, selectMarketPlanSkills, topMarketSkills } from './compare';

const road = (skillId: string, name: string, importance: string, type: string) => ({ skillId, name, importance, type });
const market = (skillId: string, name: string, demandPct: number) => ({
  skillId,
  name,
  demandPct,
  jobCount: 10,
  companies: 4,
  n: 40,
  wilsonLower: demandPct - 0.05,
});

describe('compareRoadmapMarket', () => {
  const sets = compareRoadmapMarket(
    [road('sql', 'SQL', 'HIGH', 'REQUIRED'), road('react', 'React', 'HIGH', 'REQUIRED'), road('css', 'CSS', 'LOW', 'NICE_TO_HAVE'), road('git', 'Git', 'MEDIUM', 'RECOMMENDED')],
    [market('sql', 'SQL', 0.4), market('react', 'React', 0.08), market('css', 'CSS', 0.3), market('kafka', 'Kafka', 0.25), market('noise', 'Noise', 0.01)],
    [
      { skillId: 'kafka', label: 'EMERGING' },
      { skillId: 'sql', label: 'STABLE' },
    ],
  );

  it('splits overlap, roadmap-only and market-only', () => {
    expect(sets.overlap.map((s) => s.name)).toEqual(['CSS', 'React', 'SQL']);
    expect(sets.roadmapOnly.map((s) => s.name)).toEqual(['Git']);
    expect(sets.marketOnly.map((s) => s.name)).toEqual(['Kafka']);
    expect(inMarket(market('noise', 'Noise', 0.01))).toBe(false);
  });

  it('emerging is the stored EMERGING label, including skills outside the roadmap', () => {
    expect(sets.emerging.map((s) => s.name)).toEqual(['Kafka']);
  });

  it('importance mismatch: required-but-rare and optional-but-common', () => {
    expect(sets.mismatch.map((s) => s.name)).toEqual(['CSS', 'React']);
    expect(isMismatch(road('sql', 'SQL', 'HIGH', 'REQUIRED'), market('sql', 'SQL', 0.4))).toBe(false);
  });
});

describe('selectMarketPlanSkills', () => {
  const row = (name: string, companies: number, demandPct: number, trend: string | null) => ({
    skillId: name,
    name,
    demandPct,
    jobCount: 4,
    companies,
    n: 20,
    wilsonLower: 0.1,
    roadmapImportance: null,
    roadmapType: null,
    trend,
  });

  it('keeps market skills with enough companies, drops evidenced names, and caps after trend', () => {
    const picked = selectMarketPlanSkills(
      [
        row('Kafka', 4, 0.2, 'STABLE'),
        row('Rust', 2, 0.9, 'INCREASING'),
        row('GraphQL', 5, 0.1, 'EMERGING'),
        row('SQL', 8, 0.5, 'INCREASING'),
        row('A', 3, 0.05, 'DECREASING'),
        row('B', 3, 0.06, 'DECREASING'),
        row('C', 3, 0.07, 'DECREASING'),
        row('D', 3, 0.08, 'DECREASING'),
        row('E', 3, 0.09, 'DECREASING'),
        row('F', 3, 0.1, 'DECREASING'),
        row('G', 3, 0.11, 'DECREASING'),
      ],
      ['sql'],
    );
    expect(picked.map((s) => s.name)).toEqual(['GraphQL', 'Kafka', 'G', 'F', 'E', 'D', 'C', 'B']);
    expect(picked.some((s) => s.name === 'Rust' || s.name === 'SQL' || s.name === 'A')).toBe(false);
  });

  it('ranks the dashboard list by demand, including skills the learner already has', () => {
    const top = topMarketSkills({
      overlap: [row('SQL', 6, 0.4, 'STABLE')],
      marketOnly: [row('Kafka', 4, 0.5, 'EMERGING'), row('Noise', 1, 0.9, 'INCREASING')],
    });
    expect(top.map((s) => s.name)).toEqual(['Kafka', 'SQL']);
  });
});
