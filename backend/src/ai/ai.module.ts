import { Global, Module, forwardRef } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { LlmService } from './llm.service';
import { EmbeddingService } from './embedding.service';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { DocumentParseService } from './document-parse.service';
import { RecommendationService } from './recommendation.service';
import { FitScoreService } from './fit-score.service';
import { EvidenceService } from './evidence.service';
import { SkillLexiconService } from './skill-lexicon.service';
import { SkillMatchAgentService } from './skill-match-agent.service';
import { PracticePlanService } from './practice-plan.service';

@Global()
@Module({
  imports: [forwardRef(() => MarketModule)],
  providers: [
    LlmService,
    EmbeddingService,
    DocumentParseService,
    DocumentIntelligenceService,
    RecommendationService,
    FitScoreService,
    EvidenceService,
    SkillLexiconService,
    SkillMatchAgentService,
    PracticePlanService,
  ],
  exports: [
    LlmService,
    EmbeddingService,
    DocumentParseService,
    DocumentIntelligenceService,
    RecommendationService,
    FitScoreService,
    EvidenceService,
    SkillLexiconService,
    SkillMatchAgentService,
    PracticePlanService,
  ],
})
export class AiModule {}
