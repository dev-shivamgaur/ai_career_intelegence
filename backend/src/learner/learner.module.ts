import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MarketModule } from '../market/market.module';
import { SkillIntelModule } from '../skill-intel/skill-intel.module';
import { CompanyIntelService } from './company-intel.service';
import { GithubEvidenceService } from './github-evidence.service';
import { LearnerAdminController } from './learner-admin.controller';
import { LearnerController } from './learner.controller';
import { LearningResourceService } from './learning-resource.service';
import { PersonalRoadmapService } from './personal-roadmap.service';
import { ReadinessService } from './readiness.service';
import { SkillEvidenceService } from './skill-evidence.service';
import { SnapshotDiffService } from './snapshot-diff.service';

@Module({
  imports: [AuthModule, MarketModule, SkillIntelModule],
  controllers: [LearnerController, LearnerAdminController],
  providers: [
    SkillEvidenceService,
    GithubEvidenceService,
    ReadinessService,
    PersonalRoadmapService,
    CompanyIntelService,
    LearningResourceService,
    SnapshotDiffService,
  ],
  exports: [
    SkillEvidenceService,
    GithubEvidenceService,
    LearningResourceService,
    SnapshotDiffService,
    PersonalRoadmapService,
  ],
})
export class LearnerModule {}
