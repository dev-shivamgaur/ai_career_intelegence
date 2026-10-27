import { Global, Module } from '@nestjs/common';
import { RoadmapCorpusService } from './roadmap-corpus.service';
import { WebResearchService } from './web-research.service';
import { GithubAnalyzeService } from './github-analyze.service';
import { MarketModule } from '../market/market.module';

@Global()
@Module({
  imports: [MarketModule],
  providers: [WebResearchService, RoadmapCorpusService, GithubAnalyzeService],
  exports: [WebResearchService, RoadmapCorpusService, GithubAnalyzeService],
})
export class WebModule {}
