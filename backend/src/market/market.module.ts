import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntelConfigModule } from '../intel-config/intel-config.module';
import { SkillIntelModule } from '../skill-intel/skill-intel.module';
import { SkillCandidateService } from './candidates/skill-candidate.service';
import { SkillReviewController } from './candidates/skill-review.controller';
import { SkillReviewService } from './candidates/skill-review.service';
import { SkillSuggestService } from './candidates/skill-suggest.service';
import { CareerLlmClassifier } from './classify/career-llm.service';
import { ClassifyStage } from './classify/classify.stage';
import { ConnectorRegistry } from './connectors/connector-registry';
import { MarketDemandController } from './demand/market-demand.controller';
import { MarketDemandService } from './demand/market-demand.service';
import { MarketHttpClient } from './http/market-http-client';
import { ExtractStage } from './extract/extract.stage';
import { MarketLlmExtractor } from './extract/market-llm-extractor.service';
import { MarketFetchService } from './ingest/market-fetch.service';
import { MarketJobsController } from './jobs/market-jobs.controller';
import { MarketJobsService } from './jobs/market-jobs.service';
import { DedupeStage } from './process/dedupe.stage';
import { MarketProcessService } from './process/market-process.service';
import { MarketConsumer } from './queue/market-consumer';
import { MarketPublisher } from './queue/market-publisher.service';
import { MarketRabbitConnection } from './queue/market-rabbit.connection';
import { MarketRetentionService } from './retention/market-retention.service';
import { MarketHealthService } from './runs/market-health.service';
import { MarketRunService } from './runs/market-run.service';
import { MarketRunsController } from './runs/market-runs.controller';
import { MarketScheduler } from './scheduler/market-scheduler';
import { MarketSliceController } from './slice/market-slice.controller';
import { MarketSliceService } from './slice/market-slice.service';
import { MarketSourcesController } from './sources/market-sources.controller';
import { MarketSourcesService } from './sources/market-sources.service';

@Module({
  imports: [AuthModule, IntelConfigModule, SkillIntelModule],
  controllers: [MarketSourcesController, MarketRunsController, MarketJobsController, MarketSliceController, SkillReviewController, MarketDemandController],
  providers: [
    MarketHttpClient,
    ConnectorRegistry,
    MarketRabbitConnection,
    MarketRunService,
    MarketPublisher,
    MarketConsumer,
    MarketSourcesService,
    MarketFetchService,
    MarketRetentionService,
    MarketHealthService,
    MarketScheduler,
    MarketProcessService,
    DedupeStage,
    MarketJobsService,
    MarketLlmExtractor,
    ExtractStage,
    SkillCandidateService,
    SkillReviewService,
    SkillSuggestService,
    CareerLlmClassifier,
    ClassifyStage,
    MarketSliceService,
    MarketDemandService,
  ],
  exports: [MarketRunService, MarketPublisher],
})
export class MarketModule {}
