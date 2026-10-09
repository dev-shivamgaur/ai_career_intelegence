import { cosine, shortlist, shouldAutoMap } from './suggest';

describe('cosine / shortlist', () => {
  it('scores identical direction 1 and orthogonal 0', () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });

  it('returns the k closest skills, ties by name', () => {
    const index = [
      { id: 'b', name: 'B', vec: [1, 0] },
      { id: 'a', name: 'A', vec: [1, 0] },
      { id: 'c', name: 'C', vec: [0, 1] },
    ];
    expect(shortlist([1, 0.1], index, 2).map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('shouldAutoMap', () => {
  const policy = { autoApprove: true, autoApproveMinJobs: 5, autoApproveMinCompanies: 3, embeddingMinSimilarity: 0.9 };
  const strong = { method: 'EMBEDDING', score: 0.95, skillId: 's1' };

  it('maps only frequent, multi-company, high-similarity embedding suggestions', () => {
    expect(shouldAutoMap({ jobCount: 6, companyCount: 3 }, strong, policy)).toBe(true);
    expect(shouldAutoMap({ jobCount: 6, companyCount: 2 }, strong, policy)).toBe(false);
    expect(shouldAutoMap({ jobCount: 4, companyCount: 3 }, strong, policy)).toBe(false);
    expect(shouldAutoMap({ jobCount: 6, companyCount: 3 }, { ...strong, score: 0.89 }, policy)).toBe(false);
    expect(shouldAutoMap({ jobCount: 6, companyCount: 3 }, { ...strong, method: 'LLM' }, policy)).toBe(false);
  });

  it('never maps when the policy is off (the default)', () => {
    expect(shouldAutoMap({ jobCount: 99, companyCount: 9 }, strong, { ...policy, autoApprove: false })).toBe(false);
  });
});
