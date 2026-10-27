import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LearnerModule } from '../learner/learner.module';
import { SkillGapModule } from '../skill-gap/skill-gap.module';
import { PreparationController } from './preparation.controller';
import { PreparationService } from './preparation.service';

@Module({
  imports: [AuthModule, SkillGapModule, LearnerModule],
  controllers: [PreparationController],
  providers: [PreparationService],
  exports: [PreparationService],
})
export class PreparationModule {}
