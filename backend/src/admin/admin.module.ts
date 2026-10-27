import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminPreparationController } from './admin-preparation.controller';
import { AdminPreparationService } from './admin-preparation.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { FieldIngestAgent } from './field-ingest.agent';
import { FieldIngestScheduler } from './field-ingest.scheduler';

@Module({
  imports: [AuthModule, forwardRef(() => QueueModule)],
  controllers: [AdminCatalogController, AdminUsersController, AdminPreparationController],
  providers: [
    AdminCatalogService,
    AdminUsersService,
    AdminPreparationService,
    FieldIngestAgent,
    FieldIngestScheduler,
  ],
  exports: [FieldIngestAgent, AdminPreparationService],
})
export class AdminModule {}
