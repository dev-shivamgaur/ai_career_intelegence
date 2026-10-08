import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SkillIntelController } from './skill-intel.controller';
import { SkillIntelService } from './skill-intel.service';
import { SkillResolverService } from './skill-resolver.service';

@Module({
  imports: [AuthModule],
  controllers: [SkillIntelController],
  providers: [SkillIntelService, SkillResolverService],
  exports: [SkillResolverService],
})
export class SkillIntelModule {}
