import { DocumentStatus, DocumentType, type PrismaClient } from '../prisma/client';

export type ExtractionShape = {
  degree?: string | null;
  dateOfBirth?: string | null;
  skillsDetected?: string[];
  summary?: string | null;
  jobs?: Array<{
    title: string;
    organization?: string;
    type?: string;
    startYear?: number;
    endYear?: number;
    isPresent?: boolean;
    summary?: string;
  }>;
  projects?: Array<{
    name: string;
    description?: string;
    skills?: string[];
    link?: string;
    year?: number;
  }>;
  education?: Array<{ degree: string; institution?: string; year?: number }>;
  certifications?: Array<{ name: string; issuer?: string; year?: number }>;
  subjects?: unknown;
  suggestedFields?: Record<string, unknown>;
};

/**
 * Strip resume-derived profile rows so dashboard / gaps / roadmap can rebuild cleanly.
 * Marksheet education (Class 10 / 12) is kept.
 */
export async function clearResumeDerivedProfile(prisma: PrismaClient, profileId: string) {
  await prisma.userSkill.deleteMany({
    where: { profileId, source: 'DOCUMENT' },
  });
  await prisma.project.deleteMany({ where: { profileId } });
  await prisma.experience.deleteMany({ where: { profileId } });
  await prisma.certification.deleteMany({
    where: { profileId, issuer: 'From resume' },
  });
  // Keep Education rows (marksheets / degree uploads stay). Resume only rewrites skills & work history.
  await prisma.skillEvidence.deleteMany({
    where: { profileId, source: { in: ['RESUME', 'PROJECT', 'GITHUB'] } },
  });
  await prisma.githubRepoLink.updateMany({
    where: { profileId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function findLatestCompletedResume(
  prisma: PrismaClient,
  userId: string,
) {
  return prisma.document.findFirst({
    where: {
      userId,
      type: DocumentType.RESUME,
      status: DocumentStatus.COMPLETED,
    },
    orderBy: { updatedAt: 'desc' },
    include: { extraction: true },
  });
}

export function extractionFromRow(row: {
  degree: string | null;
  skillsDetected: string[];
  summary: string | null;
  subjects: unknown;
  suggestedFields: unknown;
  rawPayload: unknown;
}): ExtractionShape {
  const raw =
    row.rawPayload && typeof row.rawPayload === 'object'
      ? (row.rawPayload as ExtractionShape)
      : null;
  if (raw && (raw.skillsDetected || raw.jobs || raw.projects || raw.summary)) {
    return {
      ...raw,
      degree: raw.degree ?? row.degree,
      skillsDetected: raw.skillsDetected?.length ? raw.skillsDetected : row.skillsDetected,
      summary: raw.summary ?? row.summary,
    };
  }
  const suggested =
    row.suggestedFields && typeof row.suggestedFields === 'object'
      ? (row.suggestedFields as Record<string, unknown>)
      : {};
  return {
    degree: row.degree,
    skillsDetected: row.skillsDetected,
    summary: row.summary,
    dateOfBirth: typeof suggested.dateOfBirth === 'string' ? suggested.dateOfBirth : null,
    jobs: Array.isArray((suggested as { jobs?: unknown }).jobs)
      ? ((suggested as { jobs: ExtractionShape['jobs'] }).jobs ?? [])
      : [],
    projects: Array.isArray((suggested as { projects?: unknown }).projects)
      ? ((suggested as { projects: ExtractionShape['projects'] }).projects ?? [])
      : [],
  };
}
