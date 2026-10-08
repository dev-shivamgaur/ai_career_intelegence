const ALIASES: Array<[RegExp, string]> = [
  [/\bnode\.?\s*js\b|\bnodejs\b/i, 'Node.js'],
  [/\bexpress(?:\.js)?\b/i, 'Express'],
  [/\bnest(?:\.js)?\b/i, 'NestJS'],
  [/\btypescript\b/i, 'TypeScript'],
  [/\bjavascript\b/i, 'JavaScript'],
  [/\breact(?:\.js)?\b/i, 'React'],
  [/\bnext(?:\.js)?\b/i, 'Next.js'],
  [/\bangular\b/i, 'Angular'],
  [/\bvue(?:\.js)?\b/i, 'Vue'],
  [/\bmongodb\b|\bmongoose\b/i, 'MongoDB'],
  [/\bpostgres(?:ql)?\b/i, 'PostgreSQL'],
  [/\bmysql\b/i, 'MySQL'],
  [/\bredis\b/i, 'Redis'],
  [/\bdocker\b/i, 'Docker'],
  [/\bgit\b/i, 'Git'],
  [/\bgithub\b/i, 'GitHub'],
  [/\bhtml5?\b/i, 'HTML'],
  [/\bcss3?\b/i, 'CSS'],
  [/\btailwind\b/i, 'Tailwind CSS'],
  [/\bpython\b/i, 'Python'],
  [/\bdjango\b/i, 'Django'],
  [/\blaravel\b/i, 'Laravel'],
  [/\bphp\b/i, 'PHP'],
  [/\bspring\s*boot\b/i, 'Spring Boot'],
  [/\bjava\b/i, 'Java'],
  [/\bgolang\b|\bgo\s*lang\b/i, 'Go'],
  [/\brest(?:ful)?(?:\s*api)?\b/i, 'REST'],
  [/\bgraphql\b/i, 'GraphQL'],
  [/\bkubernetes\b|\bk8s\b/i, 'Kubernetes'],
  [/\baws\b/i, 'AWS'],
  [/\bprisma\b/i, 'Prisma'],
  [/\bjwt\b/i, 'JWT'],
  [/\brabbitmq\b/i, 'RabbitMQ'],
  [/\bsocket\.?io\b/i, 'Socket.IO'],
  [/\bredux\b/i, 'Redux'],
];

/** Everyday words that showed up as roadmap titles and got saved as skills. */
const GENERIC = new Set([
  'public',
  'custom',
  'client',
  'server',
  'stack',
  'app',
  'interface',
  'classes',
  'class',
  'components',
  'component',
  'rendering',
  'database',
  'testing',
  'middleware',
  'architecture',
  'routing',
  'version',
  'control',
  'basics',
  'concepts',
  'core',
  'operations',
  'integration',
  'design',
  'development',
  'frontend',
  'backend',
  'tools',
  'platforms',
  'languages',
  'projects',
  'education',
  'summary',
  'experience',
  'skills',
  'knowledge',
  'used',
  'lightly',
  'including',
  'and',
  'with',
  'for',
  'the',
]);

const GENERIC_CATEGORY_PHRASES = [
  /^database management$/i,
  /^programming languages?$/i,
  /^system architecture$/i,
  /^web servers?$/i,
  /^api development$/i,
  /^cloud computing$/i,
  /^software development$/i,
  /^technical skills?$/i,
  /^core competencies$/i,
];

export function isGenericCategorySkill(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (GENERIC_CATEGORY_PHRASES.some((p) => p.test(trimmed))) return true;
  const lower = trimmed.toLowerCase();
  if (/\b(expert|beginner|intermediate|proficient)\s*$/i.test(trimmed)) {
    const stem = lower.replace(/\s*[-–—]?\s*(expert|beginner|intermediate|proficient)\s*$/, '').trim();
    if (GENERIC_CATEGORY_PHRASES.some((p) => p.test(stem))) return true;
  }
  return false;
}

export function keepSkillName(raw: string): string | null {
  const name = raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-•*:]+|[-•*,:;]+$/g, '')
    .trim();
  if (name.length < 2 || name.length > 48) return null;
  if (/^\d+$/.test(name)) return null;
  const parts = name.toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1 && GENERIC.has(parts[0])) return null;
  if (parts.every((part) => GENERIC.has(part))) return null;
  if (isGenericCategorySkill(name)) return null;
  return name;
}

function skillBlock(text: string) {
  const match = text.match(
    /(?:technical\s+skills?|key\s+skills?|core\s+skills?|skills?\s*(?:&|and)\s+tools?|tools?\s*(?:&|and)\s+technologies|competenc(?:y|ies)|expertise)\b([\s\S]{0,3500}?)(?=\n\s*(?:projects?|education|experience|employment|work\s+history|professional\s+summary|certifications?)\b|$)/i,
  );
  return match?.[1] ?? '';
}

function phrasesFromBlock(block: string): string[] {
  const out: string[] = [];
  for (const line of block.split(/\n/)) {
    const body = line.replace(/^[^:]{0,40}:\s*/, '');
    for (const part of body.split(/[,;•|]/)) {
      const kept = keepSkillName(part);
      if (kept) out.push(kept);
    }
  }
  return out;
}

export function skillsFromText(text: string, catalog: string[]): string[] {
  const hits: string[] = [];
  for (const [pattern, name] of ALIASES) {
    if (pattern.test(text)) hits.push(name);
  }
  const block = skillBlock(text);
  const phrases = phrasesFromBlock(block);
  hits.push(...phrases);
  if (block) {
    const phraseKeys = new Set(phrases.map((p) => p.toLowerCase()));
    for (const name of catalog) {
      const kept = keepSkillName(name);
      if (!kept || kept.length < 3) continue;
      if (phraseKeys.has(kept.toLowerCase())) hits.push(kept);
    }
  }
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const name of hits) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  return unique;
}
