import { RecommendationService } from './recommendation.service';
import { computeRoleSkillMatch } from './learner-tier';

// Characterization: FitScore weights skills 35, projects 25, education 15, experience 10, market 15.
describe('RecommendationService.estimateCareerMatch (characterization)', () => {
  const svc = new RecommendationService();
  const zero = { skillScore: 0, projectScore: 0, educationScore: 0, experienceScore: 0, marketScore: 0 };

  it.each([
    ['skillScore', 35],
    ['projectScore', 25],
    ['educationScore', 15],
    ['experienceScore', 10],
    ['marketScore', 15],
  ])('weights %s at %i', (key, weight) => {
    expect(svc.estimateCareerMatch({ ...zero, [key]: 100 }).estimatedMatch).toBe(weight);
  });

  it('rounds the weighted sum and returns the input as breakdown', () => {
    const input = { skillScore: 80, projectScore: 60, educationScore: 78, experienceScore: 0, marketScore: 40 };
    const out = svc.estimateCareerMatch(input);
    expect(out.estimatedMatch).toBe(61);
    expect(out.breakdown).toEqual(input);
  });

  it('clamps to 0..100', () => {
    expect(svc.estimateCareerMatch({ ...zero, skillScore: 1000 }).estimatedMatch).toBe(100);
    expect(svc.estimateCareerMatch({ ...zero, skillScore: -1000 }).estimatedMatch).toBe(0);
  });
});

describe('computeRoleSkillMatch (characterization)', () => {
  it('returns 0% for an empty pool', () => {
    expect(computeRoleSkillMatch([], ['react'])).toEqual({ matched: 0, total: 0, percent: 0, pool: [] });
  });

  it('inherits loose substring matching', () => {
    expect(computeRoleSkillMatch(['Go', 'Rust'], ['mongodb']).matched).toBe(1);
  });
});
