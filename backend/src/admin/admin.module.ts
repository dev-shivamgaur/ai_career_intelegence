import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { FieldIngestAgent } from './field-ingest.agent';
import { FieldIngestScheduler } from './field-ingest.scheduler';

@Module({
  imports: [AuthModule, forwardRef(() => QueueModule)],
  controllers: [AdminCatalogController, AdminUsersController],
  providers: [AdminCatalogService, AdminUsersService, FieldIngestAgent, FieldIngestScheduler],
  exports: [FieldIngestAgent],
})
export class AdminModule {}