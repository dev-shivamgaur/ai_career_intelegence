import { Injectable, OnModuleInit } from '@nestjs/common';
import { MarketProcessingStatus, Prisma, type RequirementType } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IntelConfigService } from '../../intel-config/intel-config.service';
import { CANONICAL_SKILL_SEED } from '../../skill-intel/skill-aliases.seed';
import { normalizeSkillName } from '../../skill-intel/skill-normalize';
import { SkillResolverService, type SkillResolution } from '../../skill-intel/skill-resolver.service';
import { SkillCandidateService } from '../candidates/skill-candidate.service';
import type { MarketStage, StageContext, StageRow } from '../process/market-stage';
import { MarketProcessService } from '../process/market-process.service';
import { MarketRetentionService } from '../retention/market-retention.service';
import { effectiveRetention } from '../sources/compliance';
import { LLM_EXTRACTOR_VERSION, MarketLlmExtractor } from './market-llm-extractor.service';
import { MARKET_VOCABULARY } from './market-vocabulary';
import { mergeHits, validateLlmSkills, type MergedSkill } from './merge';
import { buildMatchers, excerpt, extractByRules, type DictionaryEntry } from './rule-extractor';

export const RULE_EXTRACTOR_VERSION = 'rules-1';

type Matchers = ReturnType<typeof buildMatchers>;

/**
 * DEDUPED -> EXTRACTED. Rule pass always; LLM pass when enabled and within budget.
 * Every stored skill carries a validated evidence span. Rows whose text was purged keep their old skills
 * (not reprocessable). Re-extraction replaces this raw row's skills atomically and records the extractor version.
 */
@Injectable()
export class ExtractStage implements MarketStage, OnModuleInit {
  readonly name = 'extract';
  readonly from = MarketProcessingStatus.DEDUPED;
  readonly to = MarketProcessingStatus.EXTRACTED;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: IntelConfigService,
    private readonly resolver: SkillResolverService,
    private readonly llmExtractor: MarketLlmExtractor,
    private readonly pipeline: MarketProcessService,
    private readonly retention: MarketRetentionService,
    private readonly candidates: SkillCandidateService,
  ) {}

  onModuleInit() {
    this.pipeline.registerStage(this);
    this.retention.registerExcerptPurger((sourceId, maxChars, full) => this.purgeExcerpts(sourceId, maxChars, full));
  }

  async run(row: StageRow, ctx: StageContext) {
    if (!row.marketJobId) throw new Error('Raw job has no MarketJob (dedupe did not run)');
    if (row.rawDescription === null) return;
    const text = row.rawDescription;
    const [matchers, extraction, excerptMax] = await Promise.all([
      this.matchers(ctx),
      this.config.get('extraction'),
      this.excerptLimit(row.sourceId, ctx),
    ]);

    const ruleHits = extractByRules(text, matchers);
    let llmSkills: ReturnType<typeof validateLlmSkills> = [];
    let usedLlm = false;
    if (this.llmExtractor.enabled()) {
      const llm = await this.llmExtractor.extract(text);
      if ('skills' in llm) {
        usedLlm = true;
        llmSkills = validateLlmSkills(text, llm.skills, extraction.llmOnlyConfidenceCap);
        this.bump(ctx, 'llmCalls');
        this.bump(ctx, 'llmDropped', llm.skills.length - llmSkills.length);
      } else {
        this.bump(ctx, `llmSkipped${llm.skipped}`);
      }
    }

    const names = [...new Set([...ruleHits.map((h) => h.name), ...llmSkills.map((s) => s.name)])];
    const resolved = new Map<string, SkillResolution>();
    const decisions = await this.decisions(ctx);
    const rejected = new Set<string>();
    (await this.resolver.resolveMany(names)).forEach((r, i) => {
      const decision = r.skillId ? undefined : decisions.get(r.normalized);
      if (decision === null) rejected.add(names[i]);
      resolved.set(names[i], decision ? { ...r, skillId: decision, method: 'ALIAS', confidence: 0.9 } : r);
    });
    const keyOf = (name: string) => resolved.get(name)?.skillId ?? `n:${normalizeSkillName(name)}`;
    const merged = mergeHits(ruleHits, llmSkills, keyOf).filter(
      (m) => m.confidence >= extraction.minSkillConfidence && !rejected.has(m.name),
    );
    const version = usedLlm ? `${RULE_EXTRACTOR_VERSION}+${LLM_EXTRACTOR_VERSION}` : RULE_EXTRACTOR_VERSION;

    const rows = this.toRows(merged, resolved, text, excerptMax, row, version);
    const previous = await this.prisma.marketJobSkill.findMany({
      where: { rawJobId: row.id, skillId: null },
      select: { normalizedName: true },
    });
    await this.prisma.$transaction([
      this.prisma.marketJobSkill.deleteMany({ where: { rawJobId: row.id } }),
      this.prisma.marketJobSkill.createMany({ data: rows, skipDuplicates: true }),
      this.prisma.marketRawJob.update({ where: { id: row.id }, data: { processorVersion: version } }),
    ]);
    const unresolved = rows.filter((r) => !r.skillId).map((r) => r.normalizedName);
    await this.candidates.refresh([...unresolved, ...previous.map((p) => p.normalizedName)]);
    this.bump(ctx, 'skillsExtracted', rows.length);
    this.bump(ctx, 'skillsUnresolved', unresolved.length);
  }

  private toRows(
    merged: MergedSkill[],
    resolved: Map<string, SkillResolution>,
    text: string,
    excerptMax: number,
    row: StageRow,
    version: string,
  ) {
    const seen = new Set<string>();
    const out: Prisma.MarketJobSkillCreateManyInput[] = [];
    for (const m of merged) {
      const r = resolved.get(m.name);
      const normalizedName = normalizeSkillName(r?.skillName ?? m.name);
      if (!normalizedName || seen.has(normalizedName)) continue;
      seen.add(normalizedName);
      const ex = excerpt(text, m.span, excerptMax);
      out.push({
        marketJobId: row.marketJobId!,
        rawJobId: row.id,
        rawName: m.name.slice(0, 120),
        normalizedName,
        skillId: r?.skillId ?? null,
        resolveMethod: r?.method ?? 'NONE',
        level: m.level as RequirementType,
        confidence: Math.round(m.confidence * 1000) / 1000,
        method: m.method,
        evidence: ex?.text ?? null,
        evidenceStart: m.span.matchStart,
        evidenceEnd: m.span.matchEnd,
        yearsRequired: m.yearsRequired,
        extractorVersion: version,
      });
    }
    return out;
  }

  /** Dictionary: curated seed + market vocabulary + approved aliases + skills with a controlled domain. */
  private async matchers(ctx: StageContext): Promise<Matchers> {
    const key = 'extract:matchers';
    if (ctx.cache.has(key)) return ctx.cache.get(key) as Matchers;
    const [aliases, domainSkills] = await Promise.all([
      this.prisma.skillAlias.findMany({ where: { status: 'APPROVED' }, select: { alias: true, skill: { select: { name: true } } } }),
      this.prisma.skill.findMany({ where: { domainId: { not: null } }, select: { name: true } }),
    ]);
    const entries: DictionaryEntry[] = [
      ...CANONICAL_SKILL_SEED.map((s) => ({ name: s.name, forms: s.aliases })),
      ...MARKET_VOCABULARY,
      ...domainSkills.map((s) => ({ name: s.name, forms: [] })),
      ...aliases.map((a) => ({ name: a.skill.name, forms: [a.alias] })),
    ];
    const matchers = buildMatchers(entries);
    ctx.cache.set(key, matchers);
    return matchers;
  }

  /** Reviewed candidates: normalized name -> mapped skill id, or null when rejected as not a skill. */
  private async decisions(ctx: StageContext): Promise<Map<string, string | null>> {
    const key = 'extract:decisions';
    if (!ctx.cache.has(key)) {
      const rows = await this.prisma.skillCandidate.findMany({
        where: { status: { in: ['APPROVED', 'MAPPED', 'MERGED', 'REJECTED'] } },
        select: { normalizedName: true, status: true, resolvedSkillId: true },
      });
      const map = new Map<string, string | null>();
      for (const r of rows) {
        if (r.status === 'REJECTED') map.set(r.normalizedName, null);
        else if (r.resolvedSkillId) map.set(r.normalizedName, r.resolvedSkillId);
      }
      ctx.cache.set(key, map);
    }
    return ctx.cache.get(key) as Map<string, string | null>;
  }

  private async excerptLimit(sourceId: string, ctx: StageContext): Promise<number> {
    const key = `extract:excerpt:${sourceId}`;
    if (!ctx.cache.has(key)) {
      const [source, retention] = await Promise.all([
        this.prisma.marketSource.findUniqueOrThrow({ where: { id: sourceId } }),
        this.config.get('retention'),
      ]);
      ctx.cache.set(key, effectiveRetention(source, retention).evidenceExcerptMaxChars);
    }
    return ctx.cache.get(key) as number;
  }

  private bump(ctx: StageContext, counter: string, by = 1) {
    const counters = (ctx.cache.get('counters') as Record<string, number> | undefined) ?? {};
    counters[counter] = (counters[counter] ?? 0) + by;
    ctx.cache.set('counters', counters);
  }

  /** Retention hook: clear excerpts when disallowed (or on full purge), else trim them to the current limit. */
  private async purgeExcerpts(sourceId: string, maxChars: number, full: boolean): Promise<number> {
    if (full || maxChars <= 0) {
      const res = await this.prisma.marketJobSkill.updateMany({
        where: { rawJob: { sourceId }, evidence: { not: null } },
        data: { evidence: null },
      });
      return res.count;
    }
    return this.prisma.$executeRaw`
      UPDATE "market_job_skill" AS s SET "evidence" = LEFT(s."evidence", ${maxChars}::int)
      FROM "market_raw_job" AS r
      WHERE s."rawJobId" = r.id AND r."sourceId" = ${sourceId} AND LENGTH(s."evidence") > ${maxChars}::int`;
  }
}
