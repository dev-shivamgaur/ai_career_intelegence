/**
 * Canonical comparison key for skill names: "Node.js", "NodeJS" and "node js" all become "nodejs".
 * Separate from ai/skill-match normalizeSkill, which strips filler words for the legacy fuzzy matcher.
 */
export function normalizeSkillName(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/c\+\+/g, 'cpp')
    .replace(/c#/g, 'csharp')
    .replace(/f#/g, 'fsharp')
    .replace(/\.net\b/g, 'dotnet')
    .replace(/[^a-z0-9]+/g, '');
}

/** Lowercased word tokens for word-boundary matching ("java" never matches inside "javascript"). */
export function wordTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/c\+\+/g, 'cpp')
    .replace(/c#/g, 'csharp')
    .replace(/\.net\b/g, 'dotnet')
    .replace(/node\.js/g, 'nodejs')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
