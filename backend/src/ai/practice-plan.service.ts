import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from './llm.service';
import { isJunkTopic, splitPracticePlan, type PracticePlan } from './practice-bands';

type PlanInput = {
  careerSlug: string;
  careerTitle: string;
  core: string[];
  laneId: string;
  laneLabel: string;
};

@Injectable()
export class PracticePlanService {
  private readonly logger = new Logger(PracticePlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /**
   * Shared plan for one career + the stack the user picked.
   * Uses that career's own topics. A thin catalog is filled once by the model and stored.
   */
  async resolve(input: PlanInput): Promise<PracticePlan> {
    const cached = await this.read(input);
    if (this.usable(cached)) return cached;

    const seeds = input.core.map((t) => t.trim()).filter((t) => t && !isJunkTopic(t));
    const generated = await this.generate(input, seeds);
    const plan = this.usable(generated) ? generated : splitPracticePlan(seeds);
    if (this.usable(plan)) await this.save(input, plan);
    return plan;
  }

  private usable(plan: PracticePlan): boolean {
    return plan.week.length + plan.applied.length + plan.tough.length >= 4;
  }

  private tag(input: PlanInput, band: keyof PracticePlan): string {
    return `practice:${input.careerSlug}:${input.laneId}:${band}`;
  }

  private async read(input: PlanInput): Promise<PracticePlan> {
    const rows = await this.prisma.knowledgeChunk.findMany({
      where: { tags: { has: `practice-plan:${input.careerSlug}:${input.laneId}` } },
    });
    const pick = (band: keyof PracticePlan) =>
      rows.filter((row) => row.tags.includes(this.tag(input, band))).map((row) => row.title);
    return { week: pick('week'), applied: pick('applied'), tough: pick('tough') };
  }

  private async save(input: PlanInput, plan: PracticePlan) {
    const bands: Array<keyof PracticePlan> = ['week', 'applied', 'tough'];
    for (const band of bands) {
      for (const title of plan[band]) {
        const tags = [`practice-plan:${input.careerSlug}:${input.laneId}`, this.tag(input, band), `family:${input.careerSlug}`];
        const existing = await this.prisma.knowledgeChunk.findFirst({
          where: { title, tags: { has: this.tag(input, band) } },
        });
        if (existing) continue;
        await this.prisma.knowledgeChunk.create({
          data: {
            title,
            content: `${title} is a ${band} topic for ${input.careerTitle} (${input.laneLabel}).`,
            source: `practice-plan:${input.careerSlug}:${input.laneId}`,
            tags,
          },
        });
      }
    }
  }

  private async generate(input: PlanInput, seeds: string[]): Promise<PracticePlan> {
    if (!this.llm.isConfigured()) return splitPracticePlan(seeds);
    try {
      const text = await this.llm.complete(
        [
          {
            role: 'system',
            content:
              'Build a practice plan for the given career and the learner\'s chosen specialty. The career can be any field. Return JSON only: {"week":string[],"applied":string[],"tough":string[]}. week has 6 to 8 first skills, applied has 6 to 8 next skills, tough has 6 to 9 harder skills. Every topic must belong to that career and specialty. Do not use software topics for a non-software career. No "Introduction", "Tool", or "Learn about".',
          },
          {
            role: 'user',
            content: JSON.stringify({
              career: input.careerTitle,
              specialty: input.laneLabel,
              catalogTopics: seeds,
            }),
          },
        ],
        { temperature: 0.2 },
      );
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as Partial<PracticePlan>;
      const asList = (value: unknown) =>
        Array.isArray(value) ? value.map((item) => String(item).trim()).filter((item) => item && !isJunkTopic(item)).slice(0, 9) : [];
      return {
        week: asList(parsed.week).slice(0, 8),
        applied: asList(parsed.applied).slice(0, 8),
        tough: asList(parsed.tough).slice(0, 9),
      };
    } catch (err) {
      this.logger.warn(`Practice plan skipped: ${(err as Error).message}`);
      return splitPracticePlan(seeds);
    }
  }
}
