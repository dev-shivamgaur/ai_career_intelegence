import { Injectable, NotFoundException } from '@nestjs/common';
import { EvidenceClaim, EvidenceQuality, EvidenceSource, Prisma } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const QUALITY_RANK: Record<EvidenceQuality, number> = { MENTIONED: 1, DEMONSTRATED: 2, ASSESSED: 3 };

export type ObserveInput = {
  profileId: string;
  skillId: string;
  source: EvidenceSource;
  quality: EvidenceQuality;
  sourceRef?: string | null;
  signal?: string | null;
  observedAt?: Date;
};

@Injectable()
export class SkillEvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Inserts a new observation and retires only the previous current row for the same source. Older rows stay. */
  async observe(input: ObserveInput) {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.skillEvidence.create({
        data: {
          profileId: input.profileId,
          skillId: input.skillId,
          source: input.source,
          quality: input.quality,
          sourceRef: input.sourceRef ?? null,
          signal: input.signal?.slice(0, 240) ?? null,
          observedAt: input.observedAt ?? new Date(),
          current: true,
        },
      });
      await tx.skillEvidence.updateMany({
        where: { profileId: input.profileId, skillId: input.skillId, source: input.source, current: true, id: { not: created.id } },
        data: { current: false, supersededById: created.id },
      });
      await this.refreshSummary(tx, input.profileId, input.skillId);
      return created;
    });
    return row;
  }

  async listForUser(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) return [];
    const rows = await this.prisma.skillEvidence.findMany({
      where: { profileId: profile.id },
      orderBy: { observedAt: 'desc' },
      take: 100,
      include: { skill: { select: { id: true, name: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      skillId: row.skillId,
      skill: row.skill.name,
      source: row.source,
      quality: row.quality,
      signal: row.signal,
      sourceRef: row.sourceRef,
      observedAt: row.observedAt,
      current: row.current,
    }));
  }

  async remove(userId: string, evidenceId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { id: true } });
    const row = await this.prisma.skillEvidence.findFirst({ where: { id: evidenceId, profileId: profile?.id } });
    if (!row) throw new NotFoundException({ error: 'EVIDENCE_NOT_FOUND', message: 'Evidence record not found' });
    await this.prisma.skillEvidence.delete({ where: { id: row.id } });
    await this.refreshSummary(this.prisma, row.profileId, row.skillId);
    return { deleted: true };
  }

  private async refreshSummary(db: Prisma.TransactionClient | PrismaService, profileId: string, skillId: string) {
    const current = await db.skillEvidence.findMany({ where: { profileId, skillId, current: true } });
    const best = [...current].sort((a, b) => QUALITY_RANK[b.quality] - QUALITY_RANK[a.quality])[0];
    if (!best) {
      await db.skillEvidenceSummary.deleteMany({ where: { profileId, skillId } });
      return;
    }
    const status: EvidenceClaim = best.quality === 'ASSESSED' ? 'VERIFIED' : best.quality === 'DEMONSTRATED' ? 'SUPPORTED' : 'CLAIMED';
    await db.skillEvidenceSummary.upsert({
      where: { profileId_skillId: { profileId, skillId } },
      create: { profileId, skillId, status },
      update: { status },
    });
  }
}
