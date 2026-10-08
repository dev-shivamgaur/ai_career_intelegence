import { isAdvancedTopic } from './stack-lanes';

export type PracticePlan = {
  week: string[];
  applied: string[];
  tough: string[];
};

const JUNK_EXACT = new Set([
  'introduction',
  'tool',
  'tools',
  'resources',
  'overview',
  'basics',
]);

/** Roadmap-graph chrome, not a skill. Same rule for every career. */
export function isJunkTopic(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (n.length < 3) return true;
  if (JUNK_EXACT.has(n)) return true;
  if (/^(learn about|pick a|introduction to|what is)\b/.test(n)) return true;
  return false;
}

export function splitThirds<T>(items: T[]): [T[], T[], T[]] {
  const a = Math.ceil(items.length / 3);
  const rest = items.length - a;
  const b = Math.ceil(rest / 2);
  return [items.slice(0, a), items.slice(a, a + b), items.slice(a + b)];
}

export function splitPracticePlan(titles: string[]): PracticePlan {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of titles) {
    const title = raw.trim();
    const key = title.toLowerCase();
    if (!title || isJunkTopic(title) || seen.has(key)) continue;
    seen.add(key);
    clean.push(title);
  }
  const toughMarked = clean.filter((title) => isAdvancedTopic(title));
  const rest = clean.filter((title) => !isAdvancedTopic(title));
  const weekCount = Math.ceil(rest.length / 3);
  const appliedCount = Math.ceil((rest.length - weekCount) / 2);
  return {
    week: rest.slice(0, weekCount),
    applied: rest.slice(weekCount, weekCount + appliedCount),
    tough: [...rest.slice(weekCount + appliedCount), ...toughMarked],
  };
}
