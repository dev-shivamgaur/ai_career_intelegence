import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SarkariController } from './sarkari.controller';
import { SarkariExamController } from './sarkari-exam.controller';
import { SarkariExamService } from './sarkari-exam.service';
import { SarkariJudgeService } from './sarkari-judge.service';
import { SarkariDocsService } from './sarkari-docs.service';
import { SarkariInternetService } from './sarkari-internet.service';
import { SarkariRagService } from './sarkari-rag.service';

@Module({
  imports: [AuthModule],
  controllers: [SarkariController, SarkariExamController],
  providers: [
    SarkariExamService,
    SarkariJudgeService,
    SarkariDocsService,
    SarkariInternetService,
    SarkariRagService,
  ],
  exports: [SarkariJudgeService, SarkariExamService, SarkariRagService, SarkariInternetService, SarkariDocsService],
})
export class SarkariModule {}
