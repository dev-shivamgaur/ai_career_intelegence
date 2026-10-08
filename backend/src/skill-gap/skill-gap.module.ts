import { Module } from '@nestjs/common';
import { SkillGapController } from './skill-gap.controller';
import { SkillGapService } from './skill-gap.service';
import { AuthModule } from '../auth/auth.module';
import { ProgressModule } from '../progress/progress.module';

@Module({
  imports: [AuthModule, ProgressModule],
  controllers: [SkillGapController],
  providers: [SkillGapService],
  exports: [SkillGapService],
})
export class SkillGapModule {}
