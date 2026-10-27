import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { AuthModule } from '../auth/auth.module';
import { SkillGapModule } from '../skill-gap/skill-gap.module';
import { SarkariModule } from '../sarkari/sarkari.module';
import { LearnerModule } from '../learner/learner.module';

@Module({
  imports: [AuthModule, SkillGapModule, SarkariModule, LearnerModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
