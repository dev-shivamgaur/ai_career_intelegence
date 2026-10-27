import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { AuthModule } from '../auth/auth.module';
import { SkillGapModule } from '../skill-gap/skill-gap.module';
import { ProgressModule } from '../progress/progress.module';
import { LearnerModule } from '../learner/learner.module';
import { ResearchModule } from '../research/research.module';

@Module({
  imports: [AuthModule, SkillGapModule, ProgressModule, LearnerModule, ResearchModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
