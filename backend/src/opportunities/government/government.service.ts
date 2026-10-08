import { Injectable, NotFoundException } from '@nestjs/common';
import { EligibilityStatus } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GovernmentService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const opportunities = await this.prisma.governmentOpportunity.findMany({
      orderBy: { createdAt: 'asc' },
      include: { eligibilities: { where: { userId } } },
    });
    return opportunities.map((o) => this.map(o));
  }

  async get(id: string, userId: string) {
    const o = await this.prisma.governmentOpportunity.findUnique({
      where: { id },
      include: { eligibilities: { where: { userId } } },
    });
    if (!o) {
      throw new NotFoundException({
        error: 'GOV_NOT_FOUND',
        message: 'Government opportunity not found',
      });
    }
    return this.map(o);
  }

  private map(o: {
    id: string;
    organization: string;
    opportunity: string;
    eligibility: string;
    ageRequirement: string | null;
    educationRequirement: string | null;
    location: string | null;
    deadline: string | null;
    sourceVerification: string | null;
    officialNote: string | null;
    isDemo: boolean;
    eligibilities: Array<{ status: EligibilityStatus; note: string | null }>;
  }) {
    return {
      id: o.id,
      organization: o.organization,
      opportunity: o.opportunity,
      eligibility: o.eligibility,
      ageRequirement: o.ageRequirement,
      educationRequirement: o.educationRequirement,
      location: o.location,
      deadline: o.deadline,
      sourceVerification: o.sourceVerification,
      officialNote: o.officialNote,
      isDemo: o.isDemo,
      eligibilityStatus: o.eligibilities[0]?.status ?? null,
      eligibilityNote: o.eligibilities[0]?.note ?? null,
    };
  }
}
