import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { skillsFromText } from '../ai/skill-lexicon';
import { normalizeSkillName } from './skill-normalize';

export type ResolveMethod = 'EXACT' | 'NORMALIZED' | 'ALIAS' | 'LEXICON' | 'NONE';

export type SkillResolution = {
  raw: string;
  normalized: string;
  skillId: string | null;
  skillName: string | null;
  method: ResolveMethod;
  confidence: number;
};

type SkillRef = { id: string; name: string };

type ResolverIndex = {
  byName: Map<string, SkillRef>;
  byNormalized: Map<string, SkillRef>;
  byAlias: Map<string, SkillRef>;
  ambiguousNormalized: number;
  loadedAt: number;
};

export const RESOLVE_CONFIDENCE: Record<Exclude<ResolveMethod, 'NONE'>, number> = {
  EXACT: 1,
  NORMALIZED: 0.95,
  ALIAS: 0.9,
  LEXICON: 0.75,
};

const INDEX_TTL_MS = 5 * 60 * 1000;

/**
 * Deterministic skill resolution for Market Intelligence: exact name, normalized name, approved alias, lexicon.
 * Shadow mode: only new market code calls this. Resume extraction and the legacy comparison do not.
 */
@Injectable()
export class SkillResolverService {
  private readonly logger = new Logger(SkillResolverService.name);
  private index: ResolverIndex | null = null;
  private loading: Promise<ResolverIndex> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  invalidate() {
    this.index = null;
  }

  async resolve(raw: string): Promise<SkillResolution> {
    const index = await this.ensureIndex();
    return resolveWithIndex(raw, index);
  }

  async resolveMany(raws: string[]): Promise<SkillResolution[]> {
    const index = await this.ensureIndex();
    return raws.map((raw) => resolveWithIndex(raw, index));
  }

  async stats() {
    const index = await this.ensureIndex();
    return {
      skills: index.byName.size,
      normalizedKeys: index.byNormalized.size,
      ambiguousNormalized: index.ambiguousNormalized,
      aliases: index.byAlias.size,
      loadedAt: new Date(index.loadedAt).toISOString(),
    };
  }

  private async ensureIndex(): Promise<ResolverIndex> {
    if (this.index && Date.now() - this.index.loadedAt < INDEX_TTL_MS) return this.index;
    if (!this.loading) {
      this.loading = this.load().finally(() => {
        this.loading = null;
      });
    }
    this.index = await this.loading;
    return this.index;
  }

  private async load(): Promise<ResolverIndex> {
    const [skills, aliases] = await Promise.all([
      this.prisma.skill.findMany({ select: { id: true, name: true }, orderBy: { createdAt: 'asc' } }),
      this.prisma.skillAlias.findMany({
        where: { status: 'APPROVED' },
        select: { normalizedAlias: true, skill: { select: { id: true, name: true } } },
      }),
    ]);
    const index = buildIndex(skills, aliases.map((a) => ({ normalizedAlias: a.normalizedAlias, skill: a.skill })));
    this.logger.log(`Resolver index: ${skills.length} skills, ${aliases.length} aliases, ${index.ambiguousNormalized} ambiguous keys`);
    return index;
  }
}

/** Skills must be ordered oldest first so duplicate normalized names resolve to the original row. */
export function buildIndex(
  skills: SkillRef[],
  aliases: Array<{ normalizedAlias: string; skill: SkillRef }>,
): ResolverIndex {
  const byName = new Map<string, SkillRef>();
  const byNormalized = new Map<string, SkillRef>();
  const seenTwice = new Set<string>();
  for (const s of skills) {
    byName.set(s.name, s);
    const key = normalizeSkillName(s.name);
    if (!key) continue;
    if (byNormalized.has(key)) seenTwice.add(key);
    else byNormalized.set(key, s);
  }
  const byAlias = new Map<string, SkillRef>();
  for (const a of aliases) byAlias.set(a.normalizedAlias, a.skill);
  return { byName, byNormalized, byAlias, ambiguousNormalized: seenTwice.size, loadedAt: Date.now() };
}

export function resolveWithIndex(raw: string, index: ResolverIndex): SkillResolution {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  const normalized = normalizeSkillName(trimmed);
  const hit = (ref: SkillRef, method: Exclude<ResolveMethod, 'NONE'>): SkillResolution => ({
    raw,
    normalized,
    skillId: ref.id,
    skillName: ref.name,
    method,
    confidence: RESOLVE_CONFIDENCE[method],
  });

  const exact = index.byName.get(trimmed);
  if (exact) return hit(exact, 'EXACT');
  if (normalized) {
    const byNorm = index.byNormalized.get(normalized);
    if (byNorm) return hit(byNorm, 'NORMALIZED');
    const byAlias = index.byAlias.get(normalized);
    if (byAlias) return hit(byAlias, 'ALIAS');
  }

  // Lexicon regexes only for short names with a single unambiguous hit, so "Java Spring" never becomes "Java".
  if (trimmed && trimmed.split(' ').length <= 2) {
    const lex = skillsFromText(trimmed, []);
    if (lex.length === 1) {
      const key = normalizeSkillName(lex[0]);
      const ref = index.byName.get(lex[0]) ?? index.byNormalized.get(key) ?? index.byAlias.get(key);
      if (ref && key.length >= normalized.length * 0.6) return hit(ref, 'LEXICON');
    }
  }

  return { raw, normalized, skillId: null, skillName: null, method: 'NONE', confidence: 0 };
}
