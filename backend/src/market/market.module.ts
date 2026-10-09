import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntelConfigModule } from '../intel-config/intel-config.module';
import { SkillIntelModule } from '../skill-intel/skill-intel.module';
import { ConnectorRegistry } from './connectors/connector-registry';
import { MarketHttpClient } from './http/market-http-client';
import { MarketConsumer } from './queue/market-consumer';
import { MarketPublisher } from './queue/market-publisher.service';
import { MarketRabbitConnection } from './queue/market-rabbit.connection';
import { MarketRunService } from './runs/market-run.service';
import { MarketSourcesController } from './sources/market-sources.controller';
import { MarketSourcesService } from './sources/market-sources.service';

@Module({
  imports: [AuthModule, IntelConfigModule, SkillIntelModule],
  controllers: [MarketSourcesController],
  providers: [
    MarketHttpClient,
    ConnectorRegistry,
    MarketRabbitConnection,
    MarketRunService,
    MarketPublisher,
    MarketConsumer,
    MarketSourcesService,
  ],
  exports: [MarketRunService, MarketPublisher],
})
export class MarketModule {}
