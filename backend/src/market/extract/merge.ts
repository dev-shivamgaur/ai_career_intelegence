import { keepSkillName } from '../../ai/skill-lexicon';
import type { SkillHit, SkillLevel } from './rule-extractor';

export type LlmSkill = {
  name: string;
  level: 'REQUIRED' | 'PREFERRED' | 'NICE_TO_HAVE';
  evidence: string;
  yearsRequired?: number | null;
  confidence: number;
};

export type Span = { lineStart: number; lineEnd: number; matchStart: number; matchEnd: number };

export type ValidatedLlmSkill = { name: string; level: SkillLevel; confidence: number; span: Span; yearsRequired: number | null };

export type MergedSkill = {
  name: string;
  level: SkillLevel;
  confidence: number;
  method: 'RULE' | 'LLM' | 'RULE_LLM';
  span: Span;
  yearsRequired: number | null;
};

const LEVEL_RANK: Record<SkillLevel, number> = { REQUIRED: 3, RECOMMENDED: 2, NICE_TO_HAVE: 1 };

/** Finds an LLM quote in the description, ignoring case and whitespace differences. Null when it is not really there. */
export function locateEvidence(text: string, evidence: string): { start: number; end: number } | null {
  const words = evidence
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (words.length === 0 || evidence.trim().length < 3) return null;
  const match = new RegExp(words.join('\\s+'), 'i').exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

/** Drops skills whose evidence is not a verbatim quote or whose name is generic; caps LLM confidence. */
export function validateLlmSkills(text: string, skills: LlmSkill[], confidenceCap: number): ValidatedLlmSkill[] {
  const out: ValidatedLlmSkill[] = [];
  for (const s of skills) {
    const name = keepSkillName(s.name ?? '');
    if (!name) continue;
    const at = locateEvidence(text, s.evidence ?? '');
    if (!at) continue;
    const years = typeof s.yearsRequired === 'number' && s.yearsRequired > 0 && s.yearsRequired <= 20 ? Math.round(s.yearsRequired) : null;
    out.push({
      name,
      level: s.level === 'PREFERRED' ? 'RECOMMENDED' : s.level === 'NICE_TO_HAVE' ? 'NICE_TO_HAVE' : 'REQUIRED',
      confidence: Math.max(0, Math.min(Number(s.confidence) || 0, confidenceCap)),
      span: { lineStart: at.start, lineEnd: at.end, matchStart: at.start, matchEnd: at.end },
      yearsRequired: years,
    });
  }
  return out;
}

/**
 * Union of both passes keyed by keyOf (resolved skill id, else normalized name).
 * A skill found by both keeps the rule span and the stronger level, with a small confidence boost.
 */
export function mergeHits(rule: SkillHit[], llm: ValidatedLlmSkill[], keyOf: (name: string) => string): MergedSkill[] {
  const merged = new Map<string, MergedSkill>();
  for (const r of rule) {
    const key = keyOf(r.name);
    const prev = merged.get(key);
    const next: MergedSkill = {
      name: r.name,
      level: r.level,
      confidence: r.confidence,
      method: 'RULE',
      span: { lineStart: r.lineStart, lineEnd: r.lineEnd, matchStart: r.matchStart, matchEnd: r.matchEnd },
      yearsRequired: r.yearsRequired,
    };
    if (!prev || LEVEL_RANK[next.level] > LEVEL_RANK[prev.level]) merged.set(key, next);
  }
  for (const l of llm) {
    const key = keyOf(l.name);
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { name: l.name, level: l.level, confidence: l.confidence, method: 'LLM', span: l.span, yearsRequired: l.yearsRequired });
      continue;
    }
    if (prev.method === 'LLM') {
      if (l.confidence > prev.confidence) merged.set(key, { ...prev, confidence: l.confidence });
      continue;
    }
    merged.set(key, {
      ...prev,
      method: 'RULE_LLM',
      level: LEVEL_RANK[l.level] > LEVEL_RANK[prev.level] ? l.level : prev.level,
      confidence: Math.min(1, Math.max(prev.confidence, l.confidence) + 0.05),
      yearsRequired: prev.yearsRequired ?? l.yearsRequired,
    });
  }
  return [...merged.values()];
}
