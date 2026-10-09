import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { LlmService } from '../../ai/llm.service';
import { IntelConfigService } from '../../intel-config/intel-config.service';
import { RedisService } from '../../redis/redis.service';
import { takeLlmBudget } from '../extract/market-llm-extractor.service';

/** LLM answers never count as fully certain. */
export const LLM_CONFIDENCE_CAP = 0.85;

const choiceSchema = z.object({
  careers: z.array(z.string()).max(5),
  confidence: z.number().min(0).max(1),
});

export type CareerChoice = { slugs: string[]; confidence: number };

/** Fallback for ambiguous jobs only (classification.llmFallback, off by default). It may only choose among the candidates. */
@Injectable()
export class CareerLlmClassifier {
  private readonly logger = new Logger(CareerLlmClassifier.name);

  constructor(
    private readonly llm: LlmService,
    private readonly redis: RedisService,
    private readonly config: IntelConfigService,
  ) {}

  async choose(job: { title: string; skills: string[] }, candidates: Array<{ slug: string; title: string }>): Promise<CareerChoice | null> {
    const [cls, extraction] = await Promise.all([this.config.get('classification'), this.config.get('extraction')]);
    if (!cls.llmFallback || !candidates.length || !this.llm.isConfigured()) return null;
    if (!(await takeLlmBudget(this.redis, extraction.llmDailyLimit))) return null;
    try {
      const res = (await this.llm
        .chat({ temperature: 0 })
        .withStructuredOutput(choiceSchema)
        .invoke([
          new SystemMessage(
            'Decide which career tracks a job posting belongs to. Answer with slugs copied from the options; ' +
              'an empty list when none fits. Judge by the work described, not by single keywords.',
          ),
          new HumanMessage(
            `Title: ${job.title}\nSkills: ${job.skills.slice(0, 30).join(', ')}\nOptions:\n${candidates.map((c) => `- ${c.slug} (${c.title})`).join('\n')}`,
          ),
        ])) as z.infer<typeof choiceSchema>;
      const allowed = new Set(candidates.map((c) => c.slug));
      return { slugs: [...new Set(res.careers.filter((s) => allowed.has(s)))], confidence: Math.min(res.confidence, LLM_CONFIDENCE_CAP) };
    } catch (err) {
      this.logger.warn(`LLM classification failed: ${(err as Error).message}`);
      return null;
    }
  }
}
