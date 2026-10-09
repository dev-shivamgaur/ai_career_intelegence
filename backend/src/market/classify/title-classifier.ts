import { normalizeTitle } from '../normalize/normalizers';

export const CLASSIFIER_VERSION = 'title-1';
export const TITLE_PATTERN_CONFIDENCE = 0.9;

export type CareerPatterns = { careerId: string; titlePatterns: string[]; excludePatterns: string[] };
export type TitleMatch = { careerId: string; matchedPattern: string; isPrimary: boolean; confidence: number };

/** Lowercase words only, seniority kept: what exclusions ("manager", "head of") are matched against. */
export function wideTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim();
}

function containsPhrase(haystack: string, phrase: string): boolean {
  return !!phrase && ` ${haystack} `.includes(` ${phrase} `);
}

/** Patterns go through the same normalizer as titles, so "Back-End Developer" and "backend engineer" are the same pattern. */
export function normalizePattern(pattern: string): string {
  return normalizeTitle(pattern);
}

/**
 * Title-pattern classification: a career matches when one of its patterns appears as a whole phrase in the normalized
 * title and none of its exclusions appears in the raw title. The longest matching pattern marks the primary career.
 * No match means UNCLASSIFIED; nothing is guessed.
 */
export function classifyTitle(title: string, normalizedTitle: string, careers: CareerPatterns[]): TitleMatch[] {
  const wide = wideTitle(title);
  const matches: Array<{ careerId: string; matchedPattern: string; length: number }> = [];
  for (const career of careers) {
    if (career.excludePatterns.some((p) => containsPhrase(wide, wideTitle(p)))) continue;
    let best: string | null = null;
    for (const raw of career.titlePatterns) {
      const p = normalizePattern(raw);
      if (containsPhrase(normalizedTitle, p) && (!best || p.length > best.length)) best = p;
    }
    if (best) matches.push({ careerId: career.careerId, matchedPattern: best, length: best.length });
  }
  const primaryLength = Math.max(0, ...matches.map((m) => m.length));
  let primaryTaken = false;
  return matches.map((m) => {
    const isPrimary = !primaryTaken && m.length === primaryLength;
    if (isPrimary) primaryTaken = true;
    return { careerId: m.careerId, matchedPattern: m.matchedPattern, isPrimary, confidence: TITLE_PATTERN_CONFIDENCE };
  });
}

const COMMON_EXCLUDES = ['manager', 'director', 'head of', 'vp', 'recruiter', 'sales', 'account executive'];

/** Starting points offered in the admin UI. Nothing is saved until an admin applies them. */
export const SUGGESTED_PATTERNS: Record<string, { titlePatterns: string[]; excludePatterns: string[] }> = {
  backend: {
    titlePatterns: ['backend', 'server side', 'api engineer', 'node engineer', 'java engineer', 'golang engineer', 'go engineer', 'python engineer', 'fullstack'],
    excludePatterns: COMMON_EXCLUDES,
  },
  frontend: {
    titlePatterns: ['frontend', 'react engineer', 'ui engineer', 'web engineer', 'javascript engineer', 'typescript engineer', 'fullstack'],
    excludePatterns: [...COMMON_EXCLUDES, 'designer'],
  },
  devops: {
    titlePatterns: ['devops', 'site reliability engineer', 'platform engineer', 'infrastructure engineer', 'cloud engineer', 'release engineer', 'build engineer'],
    excludePatterns: COMMON_EXCLUDES,
  },
};
