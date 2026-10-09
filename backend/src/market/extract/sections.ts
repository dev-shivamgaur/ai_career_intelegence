export type SectionKind = 'REQUIRED' | 'PREFERRED' | 'OTHER' | 'NONE';
export type Section = { start: number; end: number; kind: SectionKind };

const PREFERRED =
  /^(preferred|nice[- ]to[- ]haves?|bonus|pluses|plus|extra credit|desired|ideally|it(?:'s| is| would be)? (?:great|nice|a plus)|even better|you might also have|what would make you stand out|standout)/i;
const REQUIRED =
  /^(requirements?|qualifications?|minimum qualifications|basic qualifications|required|must[- ]haves?|what you(?:'ll)? (?:need|bring)|what we(?:'re| are)? looking for|who you are|you (?:have|bring|are|will have)|about you|your (?:skills|experience|background|profile)|skills|key skills|experience|what you need|we(?:'d| would) love|we expect)/i;
const OTHER =
  /^(responsibilities|what you(?:'ll| will) do|in this role|the role|about (?:the role|us|the team|the company|the job)|benefits|perks|compensation|salary|our (?:tech )?stack|tech stack|location|how to apply|we offer|what we offer|why join|who we are|the team|day to day|your impact|what you(?:'ll| will) work on|equal opportunity)/i;

/** A short line that names a section, optionally followed by ":" and inline content. */
function headingKind(line: string): SectionKind | null {
  const t = line.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
  if (!t || t.startsWith('- ')) return null;
  const head = t.includes(':') ? t.slice(0, t.indexOf(':')) : t;
  if (head.length > 80) return null;
  if (!t.includes(':') && t.length > 80) return null;
  // A full sentence is body text, not a heading ("Plus, we offer equity.").
  if (!t.includes(':') && /[.!?]$/.test(t) && t.split(/\s+/).length > 4) return null;
  if (PREFERRED.test(head)) return 'PREFERRED';
  if (REQUIRED.test(head)) return 'REQUIRED';
  if (OTHER.test(head)) return 'OTHER';
  return null;
}

/**
 * Splits a plain-text description into sections by recognized headings.
 * Text before the first heading is OTHER; a description with no recognized heading is one NONE section.
 */
export function detectSections(text: string): Section[] {
  const sections: Section[] = [];
  let offset = 0;
  let current: Section | null = null;
  for (const line of text.split('\n')) {
    const kind = headingKind(line);
    if (kind) {
      if (current) current.end = offset;
      else if (offset > 0) sections.push({ start: 0, end: offset, kind: 'OTHER' });
      current = { start: offset, end: text.length, kind };
      sections.push(current);
    }
    offset += line.length + 1;
  }
  if (!sections.length) return [{ start: 0, end: text.length, kind: 'NONE' }];
  return sections;
}

export function sectionAt(sections: Section[], index: number): SectionKind {
  for (const s of sections) if (index >= s.start && index < s.end) return s.kind;
  return 'NONE';
}

/** Inline wording on the same line overrides the section: "Kafka experience is a plus". */
export const INLINE_PREFERRED = /\b(a plus|is a bonus|bonus points|nice to have|preferred|ideally|desirable|would be great|is helpful|a big plus)\b/i;
