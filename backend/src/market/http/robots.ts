export type RobotsRule = { allow: boolean; pattern: string };
export type RobotsGroup = { agents: string[]; rules: RobotsRule[] };

/** Minimal RFC 9309 parser: user-agent groups with Allow / Disallow lines. Other directives are ignored. */
export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'allow' || field === 'disallow') {
      if (field === 'disallow' && !value) continue;
      current.rules.push({ allow: field === 'allow', pattern: value });
    }
  }
  return groups;
}

function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regex = new RegExp(
    '^' + body.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''),
  );
  return regex.test(path);
}

/** Longest matching rule wins; Allow wins a tie. A group naming our product token beats the "*" group. */
export function isPathAllowed(groups: RobotsGroup[], productToken: string, path: string): boolean {
  const token = productToken.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  const rules = chosen.flatMap((g) => g.rules);
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!patternMatches(rule.pattern, path)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}
