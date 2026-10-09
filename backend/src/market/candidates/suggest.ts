export type Vector = number[];
export type IndexedSkill = { id: string; name: string; vec: Vector };
export type Scored = { id: string; name: string; score: number };

export function cosine(a: Vector, b: Vector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Most similar skills first; ties broken by name so results are reproducible. */
export function shortlist(query: Vector, index: IndexedSkill[], k: number): Scored[] {
  return index
    .map((s) => ({ id: s.id, name: s.name, score: Math.round(cosine(query, s.vec) * 10000) / 10000 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, Math.max(1, k));
}

export type AutoApprovePolicy = { autoApprove: boolean; autoApproveMinJobs: number; autoApproveMinCompanies: number; embeddingMinSimilarity: number };

/**
 * Auto-mapping is off by default. When on, only an embedding suggestion at or above the similarity threshold
 * for a name seen in enough jobs from enough companies is mapped, and it stays flagged as auto-approved.
 */
export function shouldAutoMap(
  candidate: { jobCount: number; companyCount: number },
  suggestion: { method: string; score: number | null; skillId: string | null },
  policy: AutoApprovePolicy,
): boolean {
  return (
    policy.autoApprove &&
    suggestion.method === 'EMBEDDING' &&
    !!suggestion.skillId &&
    (suggestion.score ?? 0) >= policy.embeddingMinSimilarity &&
    candidate.jobCount >= policy.autoApproveMinJobs &&
    candidate.companyCount >= policy.autoApproveMinCompanies
  );
}
