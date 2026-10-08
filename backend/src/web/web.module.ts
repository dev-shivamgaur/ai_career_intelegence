import { Global, Module } from '@nestjs/common';
import { RoadmapCorpusService } from './roadmap-corpus.service';
import { WebResearchService } from './web-research.service';
import { GithubAnalyzeService } from './github-analyze.service';

@Global()
@Module({
  providers: [WebResearchService, RoadmapCorpusService, GithubAnalyzeService],
  exports: [WebResearchService, RoadmapCorpusService, GithubAnalyzeService],
})
export class WebModule {}
