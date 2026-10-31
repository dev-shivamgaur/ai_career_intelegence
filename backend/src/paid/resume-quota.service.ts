import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DocumentType, PrepPlan } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resumeQuotaView, resumeUploadLimit } from './plan-limits';

@Injectable()
export class ResumeQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  async getQuota(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { prepPlan: true, resumeUploadCount: true },
    });
    const plan = user?.prepPlan ?? PrepPlan.FREE;
    const used = user?.resumeUploadCount ?? 0;
    return resumeQuotaView(plan, used);
  }

  async assertCanUploadResume(userId: string, docType: DocumentType) {
    if (docType !== DocumentType.RESUME) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { prepPlan: true, resumeUploadCount: true, role: true },
    });
    if (!user) return;
    if (user.role === 'ADMIN') return;
    const limit = resumeUploadLimit(user.prepPlan);
    if (user.resumeUploadCount >= limit) {
      throw new HttpException(
        {
          error: 'RESUME_QUOTA',
          message: `Free plan allows ${limit} resume uploads. Upgrade to a paid plan for more changes.`,
          ...resumeQuotaView(user.prepPlan, user.resumeUploadCount),
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  async bumpResumeUpload(userId: string, docType: DocumentType) {
    if (docType !== DocumentType.RESUME) return;
    await this.prisma.user.update({
      where: { id: userId },
      data: { resumeUploadCount: { increment: 1 } },
    });
  }
}
