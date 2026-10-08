/** Fuzzy evidence match so "REST APIs" equals "REST", "Spring Boot" equals "Springboot". */
export function normalizeSkill(value: string) {
  return value
    .toLowerCase()
    .replace(/#/g, 'sharp')
    .replace(/\+\+/g, 'pp')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(api|apis|framework|basics?|language|core|advanced)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function skillMatches(name: string, known: Iterable<string>): boolean {
  const target = normalizeSkill(name);
  if (!target) return false;
  const tokens = target.split(' ').filter((t) => t.length > 1);
  for (const raw of known) {
    const k = normalizeSkill(raw);
    if (!k) continue;
    if (k === target || k.includes(target) || target.includes(k)) return true;
    if (tokens.length && tokens.every((t) => k.includes(t))) return true;
  }
  return false;
}

export function filterMissing(names: string[], known: Iterable<string>): string[] {
  return names.filter((n) => !skillMatches(n, known));
}
