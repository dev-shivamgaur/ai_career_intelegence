import { normalizeTitle } from '../normalize/normalizers';

/** Lowercase words only, seniority kept: what exclusions ("manager", "head of") are matched against. */
export function wideTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim();
}

/** Patterns go through the same normalizer as titles, so "Back-End Developer" and "backend engineer" are the same pattern. */
export function normalizePattern(pattern: string): string {
  return normalizeTitle(pattern);
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
