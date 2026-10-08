import { Module } from '@nestjs/common';
import { GovernmentController } from './government.controller';
import { GovernmentService } from './government.service';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [GovernmentController],
  providers: [GovernmentService],
})
export class GovernmentModule {}
