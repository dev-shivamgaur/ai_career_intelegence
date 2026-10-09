import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntelConfigModule } from '../intel-config/intel-config.module';
import { SkillIntelModule } from '../skill-intel/skill-intel.module';
import { ConnectorRegistry } from './connectors/connector-registry';
import { MarketHttpClient } from './http/market-http-client';
import { MarketFetchService } from './ingest/market-fetch.service';
import { MarketConsumer } from './queue/market-consumer';
import { MarketPublisher } from './queue/market-publisher.service';
import { MarketRabbitConnection } from './queue/market-rabbit.connection';
import { MarketRetentionService } from './retention/market-retention.service';
import { MarketHealthService } from './runs/market-health.service';
import { MarketRunService } from './runs/market-run.service';
import { MarketRunsController } from './runs/market-runs.controller';
import { MarketScheduler } from './scheduler/market-scheduler';
import { MarketSourcesController } from './sources/market-sources.controller';
import { MarketSourcesService } from './sources/market-sources.service';

@Module({
  imports: [AuthModule, IntelConfigModule, SkillIntelModule],
  controllers: [MarketSourcesController, MarketRunsController],
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
  ],
  exports: [MarketRunService, MarketPublisher],
})
export class MarketModule {}
