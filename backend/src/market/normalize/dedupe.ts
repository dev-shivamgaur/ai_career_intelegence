/** Cross-source dedupe helpers. Pure and deterministic. */

const SKETCH_SIZE = 256;

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Signed 32-bit so it fits a Postgres int4 column.
  return h | 0;
}

/** Bottom-k sketch of hashed word shingles. Kept after the raw description is purged. */
export function shingleSketch(text: string | null | undefined, shingleSize = 3, k = SKETCH_SIZE): number[] {
  const words = (text ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (words.length < shingleSize) return [];
  const hashes = new Set<number>();
  for (let i = 0; i + shingleSize <= words.length; i += 1) hashes.add(fnv1a(words.slice(i, i + shingleSize).join(' ')));
  return [...hashes].sort((a, b) => a - b).slice(0, k);
}

/** Jaccard estimate from two bottom-k sketches (Broder). 0 when either side has no text. */
export function sketchJaccard(a: number[], b: number[], k = SKETCH_SIZE): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const union = [...new Set([...a, ...b])].sort((x, y) => x - y).slice(0, k);
  let both = 0;
  for (const h of union) if (setA.has(h) && setB.has(h)) both += 1;
  return both / union.length;
}

export type DedupeCandidate = {
  id: string;
  normalizedTitle: string;
  countries: string[];
  isRemote: boolean;
  postedAt: Date | null;
  firstSeenAt: Date;
  shingleSketch: number[];
  /** Sources already linked to this MarketJob. Two postings on the same board are distinct vacancies. */
  sourceIds: string[];
};

export type DedupeSubject = Omit<DedupeCandidate, 'id' | 'sourceIds'> & { sourceId: string };

export function locationsCompatible(a: { countries: string[]; isRemote: boolean }, b: { countries: string[]; isRemote: boolean }) {
  if (!a.countries.length || !b.countries.length) return a.isRemote === b.isRemote || (!a.countries.length && !b.countries.length);
  return a.countries.some((c) => b.countries.includes(c));
}

/**
 * Picks the MarketJob a new posting duplicates, or null. Requires the same company (pre-filtered by the caller),
 * same normalizedTitle, compatible location, posted within windowDays, a different source, and Jaccard >= threshold.
 */
export function findDuplicate(
  subject: DedupeSubject,
  candidates: DedupeCandidate[],
  opts: { windowDays: number; jaccardThreshold: number },
): { id: string; similarity: number } | null {
  const windowMs = opts.windowDays * 24 * 60 * 60 * 1000;
  const when = (x: { postedAt: Date | null; firstSeenAt: Date }) => (x.postedAt ?? x.firstSeenAt).getTime();
  let best: { id: string; similarity: number } | null = null;
  for (const c of candidates) {
    if (c.normalizedTitle !== subject.normalizedTitle) continue;
    if (c.sourceIds.includes(subject.sourceId)) continue;
    if (Math.abs(when(c) - when(subject)) > windowMs) continue;
    if (!locationsCompatible(c, subject)) continue;
    const similarity = sketchJaccard(c.shingleSketch, subject.shingleSketch);
    if (similarity >= opts.jaccardThreshold && (!best || similarity > best.similarity)) best = { id: c.id, similarity };
  }
  return best;
}
