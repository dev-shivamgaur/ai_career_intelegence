import { INLINE_PREFERRED, detectSections, sectionAt, type SectionKind } from './sections';

export type SkillLevel = 'REQUIRED' | 'RECOMMENDED' | 'NICE_TO_HAVE';

export type DictionaryEntry = { name: string; forms: string[] };

export type SkillHit = {
  name: string;
  level: SkillLevel;
  confidence: number;
  /** Line containing the match (the validated evidence span) and the match itself. */
  lineStart: number;
  lineEnd: number;
  matchStart: number;
  matchEnd: number;
  yearsRequired: number | null;
};

/** Forms that are also ordinary words: matched case-sensitively, exactly as written. */
const CASE_SENSITIVE = new Set([
  'go', 'node', 'ts', 'js', 'rust', 'rails', 'express', 'react', 'spring', 'swift', 'ruby', 'spark', 'dart', 'helm',
  'azure', 'rest', 'agile', 'scrum', 'android', 'bash', 'sql', 'rtk', 'flutter', 'vite', 'nats', 'sqs', 'tdd', 'llm',
  'llms', 'jest', 'mongo', 'prisma', 'redux', 'vue', 'angular', 'django', 'flask', 'linux', 'scala', 'elixir', 'cypress',
  'snowflake', 'hibernate', 'jenkins', 'maven', 'nginx', 'ansible', 'storybook', 'figma', 'datadog', 'grafana',
  'prometheus', 'playwright', 'selenium', 'cassandra', 'redshift', 'pandas', 'airflow', 'flink', 'dbt',
]);

/** Bare forms that are too ambiguous on their own ("next steps", "nest egg"). Only their ".js" spellings count. */
const NEVER_ALONE = new Set(['next', 'nest']);

const LEVEL_CONFIDENCE: Record<SectionKind, { level: SkillLevel; confidence: number }> = {
  REQUIRED: { level: 'REQUIRED', confidence: 0.9 },
  PREFERRED: { level: 'RECOMMENDED', confidence: 0.85 },
  OTHER: { level: 'NICE_TO_HAVE', confidence: 0.7 },
  // No recognizable headings: most such postings list what they need inline.
  NONE: { level: 'REQUIRED', confidence: 0.7 },
};

type Matcher = { name: string; re: RegExp; form: string };

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildMatchers(entries: DictionaryEntry[]): Matcher[] {
  const seen = new Set<string>();
  const out: Matcher[] = [];
  for (const entry of entries) {
    for (const form of [entry.name, ...entry.forms]) {
      const trimmed = form.trim();
      const lower = trimmed.toLowerCase();
      if (!trimmed || NEVER_ALONE.has(lower)) continue;
      const key = `${entry.name}\u0000${trimmed}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const flags = CASE_SENSITIVE.has(lower) ? 'g' : 'gi';
      const body = escape(trimmed).replace(/ /g, '\\s+');
      out.push({ name: entry.name, form: trimmed, re: new RegExp(`(?<![A-Za-z0-9+#])${body}(?![A-Za-z0-9+#]|\\.[A-Za-z])`, flags) });
    }
  }
  // Longest forms first so "Spring Boot" claims its span before "Spring".
  return out.sort((a, b) => b.form.length - a.form.length);
}

/** "Go" is a programming language only in list or tech context, never "go to market" or "Go beyond". */
function goContextOk(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 12), index);
  const after = text.slice(index + 2, index + 14);
  if (/^\s*(-|to\b|ahead|live|beyond|through|further)/i.test(after)) return false;
  if (/(^|\n)\s*$/.test(before)) return /^\s*[,/(]|^\s+(and|or)\s/i.test(after);
  return /([,(/:]|\b(in|with|using|and|or|like|as|e\.g\.)|-)\s*$/i.test(before) || /^\s*[,/)]|^\s+(and|or|lang|programming|services|microservices)\b/i.test(after);
}

function lineBounds(text: string, index: number) {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const nl = text.indexOf('\n', index);
  return { start, end: nl === -1 ? text.length : nl };
}

function yearsOnLine(line: string): number | null {
  if (!/experience/i.test(line)) return null;
  const nums = [...line.matchAll(/(\d{1,2})\s*\+?\s*(?:years|yrs)/gi)].map((m) => Number(m[1])).filter((n) => n > 0 && n <= 20);
  return nums.length === 1 ? nums[0] : null;
}

/** Deterministic pass: dictionary forms on word boundaries, labelled by section. One hit per canonical skill. */
export function extractByRules(text: string, matchers: Matcher[]): SkillHit[] {
  const sections = detectSections(text);
  const claimed: Array<[number, number]> = [];
  const best = new Map<string, SkillHit>();
  const rank: Record<SkillLevel, number> = { REQUIRED: 3, RECOMMENDED: 2, NICE_TO_HAVE: 1 };

  for (const m of matchers) {
    m.re.lastIndex = 0;
    for (const match of text.matchAll(m.re)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (claimed.some(([s, e]) => start < e && end > s)) continue;
      if (m.form === 'Go' && !goContextOk(text, start)) continue;
      claimed.push([start, end]);
      const line = lineBounds(text, start);
      const lineText = text.slice(line.start, line.end);
      let { level, confidence } = LEVEL_CONFIDENCE[sectionAt(sections, start)];
      if (level === 'REQUIRED' && INLINE_PREFERRED.test(lineText)) {
        level = 'RECOMMENDED';
        confidence = 0.85;
      }
      const hit: SkillHit = {
        name: m.name,
        level,
        confidence,
        lineStart: line.start,
        lineEnd: line.end,
        matchStart: start,
        matchEnd: end,
        yearsRequired: yearsOnLine(lineText),
      };
      const prev = best.get(m.name);
      if (!prev || rank[hit.level] > rank[prev.level] || (rank[hit.level] === rank[prev.level] && hit.confidence > prev.confidence)) {
        best.set(m.name, hit);
      }
    }
  }
  return [...best.values()];
}

/**
 * Excerpt of at most maxChars inside [lineStart, lineEnd) that always contains the match [matchStart, matchEnd).
 * Null when excerpts are disallowed (maxChars 0).
 */
export function excerpt(
  text: string,
  span: { lineStart: number; lineEnd: number; matchStart: number; matchEnd: number },
  maxChars: number,
): { text: string; start: number; end: number } | null {
  if (maxChars <= 0) return null;
  let s = span.lineStart;
  let e = span.lineEnd;
  if (e - s > maxChars) {
    const room = Math.max(0, maxChars - (span.matchEnd - span.matchStart));
    s = Math.max(span.lineStart, span.matchStart - Math.floor(room / 2));
    e = Math.min(span.lineEnd, s + maxChars);
    s = Math.max(span.lineStart, e - maxChars);
  }
  const slice = text.slice(s, e).replace(/\s+/g, ' ').trim();
  return slice ? { text: slice, start: s, end: e } : null;
}
