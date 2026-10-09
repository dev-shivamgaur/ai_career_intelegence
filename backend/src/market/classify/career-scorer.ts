import type { StackLane } from '../../ai/stack-lanes';
import { normalizePattern, wideTitle } from './title-classifier';

export const CAREER_CLASSIFIER_VERSION = 'career-2';
/** Below this many resolved skills the overlap is too noisy to use. */
export const MIN_SKILLS_FOR_OVERLAP = 3;
/** A career is a candidate (stored, and offered to the LLM) from this overlap upward even without a title match. */
export const CANDIDATE_OVERLAP = 0.5;

export type CareerModel = {
  careerId: string;
  slug: string;
  title?: string;
  titlePatterns: string[];
  excludePatterns: string[];
  skillIds: Set<string>;
  lanes: StackLane[];
};

export type JobInput = {
  title: string;
  normalizedTitle: string;
  skills: Array<{ skillId: string | null; name: string }>;
};

export type ScoreWeights = { titleWeight: number; skillOverlapWeight: number };

export type CareerScore = {
  careerId: string;
  slug: string;
  titleMatch: string | null;
  overlap: number | null;
  confidence: number;
  method: 'TITLE_PATTERN' | 'SKILL_OVERLAP';
  lanes: string[];
};

function containsPhrase(haystack: string, phrase: string) {
  return !!phrase && ` ${haystack} `.includes(` ${phrase} `);
}

/** Lanes whose keywords appear as whole words in the title (weight 2) or in skill names (weight 1); best score wins, ties kept. */
export function matchLanes(title: string, skillNames: string[], lanes: StackLane[]): string[] {
  const titleWords = wideTitle(title.replace(/\.js\b/gi, 'js'));
  const skillWords = skillNames.map((n) => wideTitle(n.replace(/\.js\b/gi, 'js')));
  let best = 0;
  const scores = lanes.map((lane) => {
    let score = 0;
    for (const kw of lane.keywords) {
      const k = wideTitle(kw.replace(/\.js\b/gi, 'js'));
      if (!k) continue;
      if (containsPhrase(titleWords, k)) score += 2;
      if (skillWords.some((w) => containsPhrase(w, k))) score += 1;
    }
    best = Math.max(best, score);
    return { id: lane.id, score };
  });
  return best > 0 ? scores.filter((s) => s.score === best).map((s) => s.id) : [];
}

/**
 * confidence = titleWeight * [title pattern matches] + skillOverlapWeight * overlap, where overlap is the share of
 * the job's resolved skills that the career requires (null when the job has too few resolved skills).
 * Excluded titles ("manager") never score for that career. Only candidates are returned.
 */
export function scoreCareers(job: JobInput, careers: CareerModel[], w: ScoreWeights): CareerScore[] {
  const wide = wideTitle(job.title);
  const jobSkillIds = [...new Set(job.skills.map((s) => s.skillId).filter((id): id is string => !!id))];
  const skillNames = job.skills.map((s) => s.name);
  const out: CareerScore[] = [];
  for (const c of careers) {
    if (c.excludePatterns.some((p) => containsPhrase(wide, wideTitle(p)))) continue;
    let titleMatch: string | null = null;
    for (const raw of c.titlePatterns) {
      const p = normalizePattern(raw);
      if (containsPhrase(job.normalizedTitle, p) && (!titleMatch || p.length > titleMatch.length)) titleMatch = p;
    }
    const overlap =
      jobSkillIds.length >= MIN_SKILLS_FOR_OVERLAP && c.skillIds.size
        ? Math.round((jobSkillIds.filter((id) => c.skillIds.has(id)).length / jobSkillIds.length) * 1000) / 1000
        : null;
    if (!titleMatch && (overlap ?? 0) < CANDIDATE_OVERLAP) continue;
    const confidence = Math.round(((titleMatch ? w.titleWeight : 0) + w.skillOverlapWeight * (overlap ?? 0)) * 1000) / 1000;
    out.push({
      careerId: c.careerId,
      slug: c.slug,
      titleMatch,
      overlap,
      confidence,
      method: titleMatch ? 'TITLE_PATTERN' : 'SKILL_OVERLAP',
      lanes: matchLanes(job.title, skillNames, c.lanes),
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence || a.slug.localeCompare(b.slug));
}

/** Ambiguous: nothing reaches the threshold by rules, yet some career's skills clearly overlap. Only then may the LLM help. */
export function isAmbiguous(scores: CareerScore[], minConfidence: number): boolean {
  return !scores.some((s) => s.confidence >= minConfidence) && scores.some((s) => (s.overlap ?? 0) >= CANDIDATE_OVERLAP);
}
