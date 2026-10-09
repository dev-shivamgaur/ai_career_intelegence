import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { EmbeddingService } from '../../ai/embedding.service';
import { LlmService } from '../../ai/llm.service';
import { IntelConfigService } from '../../intel-config/intel-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { takeLlmBudget } from '../extract/market-llm-extractor.service';
import { SkillReviewService } from './skill-review.service';
import { shortlist, shouldAutoMap, type IndexedSkill, type Scored } from './suggest';

const INDEX_MAX_AGE_MS = 60 * 60 * 1000;
const EMBED_BATCH = 64;

const pickSchema = z.object({
  choice: z.string().nullable(),
  isSkill: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export type Suggestion = { method: 'EMBEDDING' | 'LLM'; skillId: string | null; score: number | null; note?: string };

/**
 * Suggests an existing Skill for pending candidates: embedding similarity against skill names (in-memory index,
 * no vector database), then optionally the LLM choosing only from that shortlist. Suggestions are advisory;
 * nothing is applied unless the auto-map policy (off by default) allows it.
 */
@Injectable()
export class SkillSuggestService {
  private readonly logger = new Logger(SkillSuggestService.name);
  private index: { skills: IndexedSkill[]; builtAt: number; count: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
    private readonly llm: LlmService,
    private readonly redis: RedisService,
    private readonly config: IntelConfigService,
    private readonly review: SkillReviewService,
  ) {}

  private async skillIndex(): Promise<IndexedSkill[]> {
    const count = await this.prisma.skill.count();
    if (this.index && this.index.count === count && Date.now() - this.index.builtAt < INDEX_MAX_AGE_MS) return this.index.skills;
    const skills = await this.prisma.skill.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const model = this.embeddings.langchain();
    const out: IndexedSkill[] = [];
    for (let i = 0; i < skills.length; i += EMBED_BATCH) {
      const batch = skills.slice(i, i + EMBED_BATCH);
      const vecs = await model.embedDocuments(batch.map((s) => s.name));
      batch.forEach((s, j) => out.push({ id: s.id, name: s.name, vec: vecs[j] }));
    }
    this.index = { skills: out, builtAt: Date.now(), count };
    this.logger.log(`Skill embedding index: ${out.length} skills`);
    return out;
  }

  private async llmPick(name: string, options: Scored[], dailyLimit: number): Promise<Suggestion | null> {
    if (!this.llm.isConfigured() || !(await takeLlmBudget(this.redis, dailyLimit))) return null;
    try {
      const res = (await this.llm
        .chat({ temperature: 0 })
        .withStructuredOutput(pickSchema)
        .invoke([
          new SystemMessage(
            'You map a skill name from a job posting to an existing skill. choice must be copied exactly from the options, ' +
              'or null when none is the same skill (a related or broader skill is NOT the same). isSkill is false when the ' +
              'name is not a technical skill at all.',
          ),
          new HumanMessage(`Name: ${name}\nOptions:\n${options.map((o) => `- ${o.name}`).join('\n')}`),
        ])) as z.infer<typeof pickSchema>;
      const chosen = options.find((o) => o.name === res.choice);
      if (!res.isSkill) return { method: 'LLM', skillId: null, score: res.confidence, note: 'LLM: not a technical skill' };
      if (!chosen) return { method: 'LLM', skillId: null, score: res.confidence, note: 'LLM: no matching skill' };
      return { method: 'LLM', skillId: chosen.id, score: Math.min(res.confidence, chosen.score) };
    } catch (err) {
      this.logger.warn(`LLM suggestion failed for ${name}: ${(err as Error).message}`);
      return null;
    }
  }

  /** Suggests for up to `limit` pending candidates without a suggestion, most frequent first. */
  async suggestPending(limit = 25) {
    const [resolverCfg, extraction] = await Promise.all([this.config.get('resolver'), this.config.get('extraction')]);
    if (!this.embeddings.isConfigured()) return { processed: 0, suggested: 0, autoMapped: 0, skipped: 'EMBEDDINGS_NOT_CONFIGURED' as const };
    const candidates = await this.prisma.skillCandidate.findMany({
      where: { status: 'PENDING', suggestionMethod: null, jobCount: { gt: 0 } },
      orderBy: [{ jobCount: 'desc' }, { normalizedName: 'asc' }],
      take: Math.min(Math.max(limit, 1), 100),
    });
    if (!candidates.length) return { processed: 0, suggested: 0, autoMapped: 0 };
    const index = await this.skillIndex();
    const model = this.embeddings.langchain();
    const vecs = await model.embedDocuments(candidates.map((c) => c.name));
    let suggested = 0;
    let autoMapped = 0;
    for (const [i, c] of candidates.entries()) {
      const list = shortlist(vecs[i], index, resolverCfg.suggestShortlist);
      const top = list[0];
      let s: Suggestion =
        top && top.score >= resolverCfg.embeddingMinSimilarity
          ? { method: 'EMBEDDING', skillId: top.id, score: top.score }
          : { method: 'EMBEDDING', skillId: null, score: top?.score ?? null, note: top ? `closest: ${top.name}` : undefined };
      if (!s.skillId && resolverCfg.llmSuggest && list.length) {
        s = (await this.llmPick(c.name, list, extraction.llmDailyLimit)) ?? s;
      }
      await this.prisma.skillCandidate.update({
        where: { id: c.id },
        data: { suggestedSkillId: s.skillId, suggestionMethod: s.method, suggestionScore: s.score, note: s.note ?? c.note },
      });
      if (s.skillId) suggested += 1;
      if (shouldAutoMap(c, s, resolverCfg)) {
        await this.review.mapToSkill(c.id, s.skillId!, null, true);
        autoMapped += 1;
      }
    }
    return { processed: candidates.length, suggested, autoMapped };
  }
}
