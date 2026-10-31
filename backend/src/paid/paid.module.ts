import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaidController } from './paid.controller';
import { ResumeQuotaService } from './resume-quota.service';

@Module({
  imports: [AuthModule],
  controllers: [PaidController],
  providers: [ResumeQuotaService],
  exports: [ResumeQuotaService],
})
export class PaidModule {}
