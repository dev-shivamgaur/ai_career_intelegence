import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ResumeQuotaService } from './resume-quota.service';

@ApiTags('paid')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('paid')
export class PaidController {
  constructor(private readonly resumeQuota: ResumeQuotaService) {}

  /** Resume upload quota for the signed-in account (FREE vs PAID). */
  @Get('resume-quota')
  resumeQuotaForUser(@CurrentUser() user: AuthUser) {
    return this.resumeQuota.getQuota(user.userId);
  }
}
