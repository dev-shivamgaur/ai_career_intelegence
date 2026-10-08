import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { AuthModule } from '../auth/auth.module';
import { SkillGapModule } from '../skill-gap/skill-gap.module';
import { SarkariModule } from '../sarkari/sarkari.module';

@Module({
  imports: [AuthModule, SkillGapModule, SarkariModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
