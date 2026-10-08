import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from './llm.service';
import { EvidenceService } from './evidence.service';
import { skillMatches } from './skill-match';
import { familyFromCareer, isAdvancedTopic } from './stack-lanes';
import { RoadmapCorpusService } from '../web/roadmap-corpus.service';

@Injectable()
export class SkillMatchAgentService {
  private readonly logger = new Logger(SkillMatchAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly evidence: EvidenceService,

    
    private readonly corpus: RoadmapCorpusService,
  ) {}

  async matchAndSuggest(userId: string) {
    const goal = await this.prisma.careerGoal.findFirst({
      where: { userId, isActive: true },
      include: { career: true },
    });
    if (!goal) return { confirmed: [] as string[], missingCore: [] as string[], missingAdvanced: [] as string[] };

    const family = familyFromCareer(goal.career);
    if (!family.core.length) {
      await this.proposeCore(goal.careerId, goal.career.title, userId);
    }
    await this.corpus.syncCareer(goal.career.slug).catch((err) => this.logger.warn(err.message));

    const fresh = await this.prisma.career.findUnique({ where: { id: goal.careerId } });
    const core = familyFromCareer(fresh ?? goal.career).core;
    const ev = await this.evidence.forUser(userId);
    const stretch = (await this.corpus.optionalTopics(goal.career.slug, ev.stack)).map((t) => t.title);
    const extraAdv = stretch.filter((t) => isAdvancedTopic(t) || !core.some((c) => c.toLowerCase() === t.toLowerCase()));

    const confirmed = core.filter((t) => skillMatches(t, ev.known));
    const missingCore = core.filter((t) => !skillMatches(t, ev.known)).slice(0, 16);
    const missingAdvanced = extraAdv.filter((t) => !skillMatches(t, ev.known)).slice(0, 16);

    return { confirmed, missingCore, missingAdvanced };
  }

  private async proposeCore(careerId: string, role: string, userId: string) {
    if (!this.llm.isConfigured()) return;
    const ev = await this.evidence.forUser(userId);
    try {
      const text = await this.llm.complete(
        [
          {
            role: 'system',
            content:
              'Propose 8 short skill titles for this career (any field: marketing, HR, design, cloud, software). JSON string array. No Wikipedia. No URLs.',
          },
          {
            role: 'user',
            content: JSON.stringify({ role, have: ev.known.slice(0, 20) }),
          },
        ],
        { temperature: 0.2 },
      );
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as unknown;
      const topics = (Array.isArray(parsed) ? parsed : []).map(String).filter((t) => t.length > 1 && t.length < 60).slice(0, 8);
      if (topics.length) {
        await this.prisma.career.update({ where: { id: careerId }, data: { coreTopics: topics } });
      }
    } catch (err) {
      this.logger.warn(`proposeCore skip: ${(err as Error).message}`);
    }
  }
}
