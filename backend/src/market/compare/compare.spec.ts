import { compareRoadmapMarket, inMarket, isMismatch } from './compare';

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
