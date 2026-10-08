import { Module } from '@nestjs/common';
import { RoadmapController } from './roadmap.controller';
import { RoadmapService } from './roadmap.service';
import { AuthModule } from '../auth/auth.module';
import { SkillGapModule } from '../skill-gap/skill-gap.module';

@Module({
  imports: [AuthModule, SkillGapModule],
  controllers: [RoadmapController],
  providers: [RoadmapService],
})
export class RoadmapModule {}
