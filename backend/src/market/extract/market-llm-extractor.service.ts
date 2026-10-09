import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { LlmService } from '../../ai/llm.service';
import { IntelConfigService } from '../../intel-config/intel-config.service';
import { RedisService } from '../../redis/redis.service';
import { marketFlags } from '../market.flags';
import type { LlmSkill } from './merge';

export const LLM_EXTRACTOR_VERSION = 'llm-1';

const extractionSchema = z.object({
  skills: z
    .array(
      z.object({
        name: z.string(),
        level: z.enum(['REQUIRED', 'PREFERRED', 'NICE_TO_HAVE']),
        evidence: z.string(),
        yearsRequired: z.number().nullable().optional(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(40),
});

export type LlmExtraction = { skills: LlmSkill[] } | { skipped: 'DISABLED' | 'NOT_CONFIGURED' | 'BUDGET' | 'ERROR'; error?: string };

/** Optional semantic pass. Off unless MARKET_LLM_EXTRACTION is on; a daily Redis budget caps cost. */
@Injectable()
export class MarketLlmExtractor {
  private readonly logger = new Logger(MarketLlmExtractor.name);

  constructor(
    private readonly llm: LlmService,
    private readonly redis: RedisService,
    private readonly config: IntelConfigService,
  ) {}

  enabled(): boolean {
    return marketFlags.llmExtraction() && this.llm.isConfigured();
  }

  async extract(description: string): Promise<LlmExtraction> {
    if (!marketFlags.llmExtraction()) return { skipped: 'DISABLED' };
    if (!this.llm.isConfigured()) return { skipped: 'NOT_CONFIGURED' };
    const cfg = await this.config.get('extraction');
    const day = new Date().toISOString().slice(0, 10);
    const key = `market:llm:${day}`;
    const used = await this.redis.incr(key);
    if (used === 1) await this.redis.expire(key, 2 * 24 * 3600);
    if (used > cfg.llmDailyLimit) return { skipped: 'BUDGET' };
    try {
      const result = await this.llm
        .chat({ temperature: 0 })
        .withStructuredOutput(extractionSchema)
        .invoke([
          new SystemMessage(
            'Extract the technical skills a job posting asks for: languages, frameworks, libraries, databases, cloud, ' +
              'tools and engineering practices. Only skills written in the posting; never infer. ' +
              'level: REQUIRED for requirements/must-have, PREFERRED for preferred/bonus/nice-to-have wording, ' +
              'NICE_TO_HAVE for skills only mentioned in passing (tech stack, about us). ' +
              'evidence: an exact quote of 5-150 characters copied from the posting that contains the skill. ' +
              'confidence: 0-1. yearsRequired only when the posting states years for that skill.',
          ),
          new HumanMessage(description.slice(0, cfg.maxDescriptionChars)),
        ]);
      return { skills: (result as z.infer<typeof extractionSchema>).skills };
    } catch (err) {
      this.logger.warn(`LLM extraction failed: ${(err as Error).message}`);
      return { skipped: 'ERROR', error: (err as Error).message };
    }
  }
}
