import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { TokenModule } from './token/token.module';
import { UsersModule } from './users/users.module';
import { ProfilesModule } from './profiles/profiles.module';
import { DocumentsModule } from './documents/documents.module';
import { CareersModule } from './careers/careers.module';
import { SkillGapModule } from './skill-gap/skill-gap.module';
import { RoadmapModule } from './roadmap/roadmap.module';
import { JobsModule } from './jobs/jobs.module';
import { GovernmentModule } from './opportunities/government/government.module';
import { SarkariModule } from './sarkari/sarkari.module';
import { ResearchModule } from './research/research.module';
import { AiModule } from './ai/ai.module';
import { RagModule } from './rag/rag.module';
import { AgentModule } from './ai/agent.module';
import { CopilotModule } from './copilot/copilot.module';
import { ProgressModule } from './progress/progress.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CommonModule } from './common/common.module';
import { AdminModule } from './admin/admin.module';
import { WebModule } from './web/web.module';
import { QueueModule } from './queue/queue.module';
import { IntelConfigModule } from './intel-config/intel-config.module';
import { SkillIntelModule } from './skill-intel/skill-intel.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    PrismaModule,
    RedisModule,
    StorageModule,
    AiModule,
    RagModule,
    AgentModule,
    TokenModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    DocumentsModule,
    CareersModule,
    SkillGapModule,
    RoadmapModule,
    JobsModule,
    GovernmentModule,
    SarkariModule,
    ResearchModule,
    CopilotModule,
    ProgressModule,
    NotificationsModule,
    AdminModule,
    WebModule,
    QueueModule,
    IntelConfigModule,
    SkillIntelModule,
  ],
})
export class AppModule {}
