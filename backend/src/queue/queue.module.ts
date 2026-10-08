import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { IngestAdminController } from './ingest-admin.controller';
import { IngestCareerConsumer } from './ingest-career.consumer';
import { IngestEnqueueService } from './ingest-enqueue.service';
import { IngestRunService } from './ingest-run.service';
import { RabbitConnection } from './rabbit.connection';

@Module({
  imports: [AuthModule, forwardRef(() => AdminModule)],
  controllers: [IngestAdminController],
  providers: [RabbitConnection, IngestEnqueueService, IngestRunService, IngestCareerConsumer],
  exports: [IngestEnqueueService, IngestRunService, RabbitConnection],
})
export class QueueModule {}
