import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { DocumentStatus, DocumentType, EducationLevel, ExperienceType, Prisma, UserStatus } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/storage.service';
import { DocumentIntelligenceService } from '../ai/document-intelligence.service';
import { RagService } from '../rag/rag.service';
import { SkillGapService } from '../skill-gap/skill-gap.service';
import { RoadmapCorpusService } from '../web/roadmap-corpus.service';
import { FitScoreService } from '../ai/fit-score.service';
import { EvidenceService } from '../ai/evidence.service';
import { SarkariDocsService } from '../sarkari/sarkari-docs.service';
import { githubReadmeSummary, projectsFromResumeText, type ParsedProject } from '../ai/resume-projects';
import { isGenericCategorySkill, keepSkillName } from '../ai/skill-lexicon';
import { GithubAnalyzeService } from '../web/github-analyze.service';
import { SkillMatchAgentService } from '../ai/skill-match-agent.service';
import { shouldPromoteToWorkingProfessional } from '../ai/learner-tier';
import { SkillLexiconService } from '../ai/skill-lexicon.service';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
    private readonly intelligence: DocumentIntelligenceService,
    private readonly rag: RagService,
    private readonly skillGaps: SkillGapService,
    private readonly corpus: RoadmapCorpusService,
    private readonly fit: FitScoreService,
    private readonly evidence: EvidenceService,
    private readonly sarkariDocs: SarkariDocsService,
    private readonly github: GithubAnalyzeService,
    private readonly matchAgent: SkillMatchAgentService,
    private readonly lexicon: SkillLexiconService,
  ) {}

  async list(userId: string) {
    return this.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { extraction: true },
    });
  }

  async get(userId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, userId },
      include: { extraction: true },
    });
    if (!doc) {
      throw new NotFoundException({ error: 'DOCUMENT_NOT_FOUND', message: 'Document not found' });
    }
    return doc;
  }

  async file(userId: string, id: string) {
    const doc = await this.get(userId, id);
    const buffer = await this.storage.read(doc.storageKey);
    return {
      buffer,
      mimeType: doc.mimeType || 'application/octet-stream',
      filename: doc.originalName || doc.filename,
    };
  }

  async getExtraction(userId: string, id: string) {
    const doc = await this.get(userId, id);
    if (!doc.extraction) {
      throw new NotFoundException({
        error: 'EXTRACTION_NOT_FOUND',
        message: 'Extraction not ready',
      });
    }
    return doc.extraction;
  }

  async upload(
    userId: string,
    file: Express.Multer.File | undefined,
    type?: DocumentType,
    label?: string,
    hints?: { status?: string; educationLevel?: string },
  ) {
    if (!file) {
      throw new BadRequestException({ error: 'FILE_REQUIRED', message: 'File is required' });
    }

    const docType = type ?? this.inferType(file.originalname);
    this.assertAllowedFile(docType, file);

    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    const stored = await this.storage.save(file.buffer, file.originalname, file.mimetype);
    const displayName = label?.trim()
      ? `${label.trim()} · ${file.originalname}`
      : file.originalname;

    const document = await this.prisma.document.create({
      data: {
        userId,
        filename: displayName,
        originalName: file.originalname,
        mimeType: file.mimetype,
        type: docType,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.storageKey,
        status: DocumentStatus.PROCESSING,
      },
      include: { extraction: true },
    });

    void this.finishExtraction(userId, document.id, {
      status: hints?.status || profile?.status,
      educationLevel: hints?.educationLevel || profile?.educationLevel,
      label: label?.trim(),
    }).catch((err) => this.logger.error(`Extraction failed ${document.id}: ${(err as Error).message}`));

    return document;
  }

  private async finishExtraction(
    userId: string,
    documentId: string,
    context: { status?: string; educationLevel?: string; label?: string },
  ) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, userId } });
    if (!document) return;
    const startedKey = document.storageKey;

    await this.prisma.document.update({
      where: { id: document.id },
      data: { status: DocumentStatus.EXTRACTING },
    });

    const buffer = await this.storage.read(document.storageKey);
    let extracted;
    try {
      extracted = await this.intelligence.extract(
        document.originalName,
        document.type,
        { buffer, mimeType: document.mimeType ?? 'application/octet-stream' },
        context,
      );
    } catch (err) {
      this.logger.warn(`Extract error ${document.id}: ${(err as Error).message}`);
      const latestAfterFail = await this.prisma.document.findFirst({ where: { id: document.id, userId } });
      if (!latestAfterFail || latestAfterFail.storageKey !== startedKey) return;
      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.FAILED },
      });
      return;
    }
    if (context.label && !extracted.degree) {
      extracted.degree = context.label;
    }

    const latest = await this.prisma.document.findFirst({ where: { id: document.id, userId } });
    if (!latest || latest.storageKey !== startedKey) return;

    await this.prisma.documentExtraction.deleteMany({ where: { documentId: document.id } });
    await this.prisma.documentExtraction.create({
      data: {
        documentId: document.id,
        degree: extracted.degree,
        subjects: extracted.subjects as Prisma.InputJsonValue | undefined,
        skillsDetected: extracted.skillsDetected,
        summary: extracted.summary,
        suggestedFields: {
          ...((extracted.suggestedFields ?? {}) as object),
          dateOfBirth: extracted.dateOfBirth,
        } as Prisma.InputJsonValue,
        rawPayload: extracted as unknown as Prisma.InputJsonValue,
      },
    });

    const text = [
      extracted.summary,
      extracted.degree,
      (extracted.skillsDetected ?? []).join(', '),
      JSON.stringify(extracted.subjects ?? []),
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await this.rag.ingestUserText(
        userId,
        `document:${document.id}`,
        document.originalName,
        text,
        'document',
        [document.type, ...(extracted.skillsDetected ?? [])],
      );
    } catch (err) {
      this.logger.warn(`RAG ingest skipped: ${(err as Error).message}`);
    }

    await this.prisma.document.update({
      where: { id: document.id },
      data: { status: DocumentStatus.COMPLETED },
    });

    try {
      await this.applyExtractionToProfile(
        userId,
        extracted,
        document.type,
        `${document.filename} ${document.originalName} ${context.label ?? ''}`,
      );
    } catch (err) {
      this.logger.warn(`Profile update after extract skipped: ${(err as Error).message}`);
    }
  }

  private async applyExtractionToProfile(
    userId: string,
    extracted: {
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
    },
    docType?: DocumentType,
    paperHint = '',
  ) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) return;

    if (docType === DocumentType.RESUME && profile.careerTrack !== 'GOVERNMENT_EXAM') {
      await this.prisma.userSkill.deleteMany({
        where: { profileId: profile.id, source: 'DOCUMENT' },
      });
    }

    for (const name of extracted.skillsDetected ?? []) {
      if (profile.careerTrack === 'GOVERNMENT_EXAM') break;
      const trimmed = keepSkillName(name);
      if (!trimmed) continue;
      const skill = await this.prisma.skill.upsert({
        where: { name: trimmed },
        update: {},
        create: { name: trimmed, category: 'Document' },
      });
      const docProficiency = isGenericCategorySkill(trimmed) ? 25 : 45;
      await this.prisma.userSkill.upsert({
        where: { profileId_skillId: { profileId: profile.id, skillId: skill.id } },
        update: { source: 'DOCUMENT' },
        create: {
          profileId: profile.id,
          skillId: skill.id,
          proficiency: docProficiency,
          source: 'DOCUMENT',
        },
      });
    }

    const degreeName = extracted.degree?.trim();
    const paper =
      docType === DocumentType.MARKSHEET
        ? this.sarkariDocs.paperFromText(
            `${paperHint} ${degreeName ?? ''} ${extracted.summary ?? ''}`,
            docType,
          )
        : 'other';

    if (paper === 'tenth' || paper === 'twelfth') {
      const level = paper === 'twelfth' ? EducationLevel.INTERMEDIATE : EducationLevel.HIGH_SCHOOL;
      const title = paper === 'twelfth' ? 'Class 12' : 'Class 10';
      const existing = await this.prisma.education.findFirst({
        where: { profileId: profile.id, level },
      });
      const row = {
        degree: degreeName || title,
        institution: existing?.institution || '',
        level,
        aiDetected: true,
      };
      if (existing) {
        await this.prisma.education.update({
          where: { id: existing.id },
          data: { ...row, degree: degreeName || existing.degree || title },
        });
      } else {
        await this.prisma.education.create({
          data: { profileId: profile.id, ...row },
        });
      }
      if (paper === 'twelfth' && profile.educationLevel === EducationLevel.HIGH_SCHOOL) {
        await this.prisma.profile.update({
          where: { id: profile.id },
          data: { educationLevel: EducationLevel.INTERMEDIATE },
        });
      }
    } else if (degreeName && (docType === DocumentType.DEGREE || docType === DocumentType.RESUME)) {
      const existing = await this.prisma.education.findFirst({
        where: { profileId: profile.id, degree: degreeName },
      });
      if (!existing) {
        await this.prisma.education.create({
          data: {
            profileId: profile.id,
            degree: degreeName,
            institution: '',
            level: profile.educationLevel,
            aiDetected: true,
          },
        });
      }
    }

    if (docType === DocumentType.RESUME && extracted.jobs?.length) {
      for (const job of extracted.jobs) {
        const title = job.title?.trim();
        if (!title) continue;
        const org = job.organization?.trim() || '';
        const summary = job.summary?.trim() || '';
        if (!EvidenceService.isRealWorkRow({ title, organization: org, summary, startYear: job.startYear ?? null })) {
          continue;
        }
        const type = this.experienceType(job.type, title);
        const existing = await this.prisma.experience.findFirst({
          where: { profileId: profile.id, title, organization: org },
        });
        const row = {
          title,
          organization: org,
          type,
          summary: job.summary?.trim() || 'From resume',
          startYear: job.startYear ?? null,
          endYear: job.endYear ?? null,
          isPresent: Boolean(job.isPresent),
        };
        if (existing) {
          await this.prisma.experience.update({ where: { id: existing.id }, data: row });
        } else {
          await this.prisma.experience.create({ data: { profileId: profile.id, ...row } });
        }
      }
      const savedJobs = (extracted.jobs ?? []).filter((j) =>
        EvidenceService.isRealWorkRow({
          title: j.title,
          organization: j.organization,
          summary: j.summary,
          startYear: j.startYear ?? null,
        }),
      );
      const hasJob = savedJobs.some((j) => this.experienceType(j.type, j.title) === ExperienceType.JOB);
      if (profile.status === UserStatus.FRESHER && hasJob) {
        const jobText = savedJobs.map((j) => `${j.title ?? ''} ${j.summary ?? ''}`).join(' ');
        const lexiconHits = await this.lexicon.match(
          `${jobText} ${(extracted.skillsDetected ?? []).join(' ')} ${extracted.summary ?? ''}`,
        );
        const ev = await this.evidence.forUser(userId);
        if (
          shouldPromoteToWorkingProfessional(ev.seniority, ev.roleSkillMatchPercent, lexiconHits.length > 0)
        ) {
          await this.prisma.profile.update({
            where: { id: profile.id },
            data: { status: UserStatus.WORKING_PROFESSIONAL },
          });
        }
      }
    }

    if (docType === DocumentType.RESUME) {
      await this.upsertProjectsFromResume(profile.id, extracted);
    }

    for (const cert of extracted.certifications ?? []) {
      const name = cert.name?.trim();
      if (!name) continue;
      const exists = await this.prisma.certification.findFirst({
        where: { profileId: profile.id, name },
      });
      if (!exists) {
        await this.prisma.certification.create({
          data: {
            profileId: profile.id,
            name,
            issuer: cert.issuer?.trim() || 'From resume',
            year: cert.year ?? null,
            aiDetected: true,
          },
        });
      }
    }

    this.logger.log(
      `Extraction saved type=${docType ?? 'unknown'} skills=${(extracted.skillsDetected ?? []).length} summaryChars=${(extracted.summary ?? '').length}`,
    );
    await this.evidence.persistDetectedStack(userId).catch(() => undefined);
    if (profile.careerTrack !== 'GOVERNMENT_EXAM') {
      await this.skillGaps.safeRecalculate(userId);
      void this.matchAgent.matchAndSuggest(userId).catch((err) => this.logger.warn(err.message));
      void this.corpus.ensureUserRoadmap(userId).catch((err) => this.logger.warn(err.message));
      void this.fit.persist(userId).catch(() => undefined);
    }
  }

  private async upsertProjectsFromResume(
    profileId: string,
    extracted: {
      summary?: string | null;
      projects?: Array<{
        name: string;
        description?: string;
        skills?: string[];
        link?: string;
        year?: number;
      }>;
    },
  ) {
    const parsed: ParsedProject[] = [
      ...(extracted.projects ?? []).map((p) => ({
        name: p.name,
        description: p.description ?? '',
        skills: p.skills ?? [],
        link: p.link,
        year: p.year,
      })),
      ...projectsFromResumeText(extracted.summary ?? ''),
    ];
    const seen = new Set<string>();
    for (const p of parsed) {
      const name = p.name?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      let description = (p.description || '').trim() || 'Extracted from resume.';
      let skills = p.skills ?? [];
      if (p.link && this.github.isGithubRepo(p.link)) {
        const analysis = await this.github.analyzeUrl(p.link).catch(() => null);
        if (analysis) {
          description = `${description}\n\nGitHub analysis: ${analysis.summary}`.slice(0, 2400);
          skills = [...new Set([...skills, ...analysis.skills])];
        } else {
          const readme = await githubReadmeSummary(p.link);
          if (readme) description = `${description}\n\nGitHub: ${readme}`.slice(0, 1800);
        }
      }
      const existing = await this.prisma.project.findFirst({
        where: { profileId, name },
      });
      const row = {
        name,
        description,
        skills,
        year: p.year ?? null,
        link: p.link ?? null,
      };
      if (existing) {
        await this.prisma.project.update({
          where: { id: existing.id },
          data: {
            description: existing.description.length > description.length ? existing.description : description,
            link: existing.link || row.link,
            skills: [...new Set([...existing.skills, ...skills])],
          },
        });
      } else {
        await this.prisma.project.create({ data: { profileId, ...row } });
      }
    }
  }

  private experienceType(value?: string, title?: string): ExperienceType {
    if (value === 'JOB') return ExperienceType.JOB;
    if (value === 'FREELANCE') return ExperienceType.FREELANCE;
    if (value === 'FRESHER') return ExperienceType.FRESHER;
    if (value === 'INTERNSHIP' || /\bintern/i.test(title ?? '')) return ExperienceType.INTERNSHIP;
    return ExperienceType.JOB;
  }

  async replace(
    userId: string,
    id: string,
    file: Express.Multer.File | undefined,
    type?: DocumentType,
    label?: string,
    hints?: { status?: string; educationLevel?: string },
  ) {
    const existing = await this.get(userId, id);
    if (!file) {
      throw new BadRequestException({ error: 'FILE_REQUIRED', message: 'File is required' });
    }
    const docType = type ?? existing.type;
    this.assertAllowedFile(docType, file);

    await this.storage.delete(existing.storageKey);
    await this.prisma.documentExtraction.deleteMany({ where: { documentId: existing.id } });

    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    const stored = await this.storage.save(file.buffer, file.originalname, file.mimetype);
    const displayName = label?.trim()
      ? `${label.trim()} · ${file.originalname}`
      : file.originalname;

    const document = await this.prisma.document.update({
      where: { id: existing.id },
      data: {
        filename: displayName,
        originalName: file.originalname,
        mimeType: file.mimetype,
        type: docType,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.storageKey,
        status: DocumentStatus.PROCESSING,
      },
      include: { extraction: true },
    });

    void this.finishExtraction(userId, document.id, {
      status: hints?.status || profile?.status,
      educationLevel: hints?.educationLevel || profile?.educationLevel,
      label: label?.trim(),
    }).catch((err) => this.logger.error(`Extraction failed ${document.id}: ${(err as Error).message}`));

    return document;
  }

  async updateMeta(userId: string, id: string, patch: { type?: DocumentType; label?: string }) {
    const existing = await this.get(userId, id);
    const filename = patch.label?.trim()
      ? `${patch.label.trim()} · ${existing.originalName}`
      : existing.filename;
    return this.prisma.document.update({
      where: { id: existing.id },
      data: {
        ...(patch.type ? { type: patch.type } : {}),
        filename,
      },
      include: { extraction: true },
    });
  }

  async remove(userId: string, id: string) {
    const doc = await this.get(userId, id);
    await this.storage.delete(doc.storageKey);
    await this.prisma.document.delete({ where: { id: doc.id } });
    return { message: 'Document deleted' };
  }

  async removeAll(userId: string) {
    const docs = await this.prisma.document.findMany({ where: { userId } });
    for (const doc of docs) {
      await this.storage.delete(doc.storageKey);
    }
    await this.prisma.document.deleteMany({ where: { userId } });
    return { message: 'Documents deleted' };
  }

  private inferType(filename: string): DocumentType {
    const lower = filename.toLowerCase();
    if (lower.includes('marksheet')) return DocumentType.MARKSHEET;
    if (lower.includes('resume') || lower.includes('cv')) return DocumentType.RESUME;
    if (lower.includes('cert')) return DocumentType.CERTIFICATE;
    if (lower.includes('degree')) return DocumentType.DEGREE;
    return DocumentType.OTHER;
  }

  private assertAllowedFile(type: DocumentType, file: Express.Multer.File) {
    const mime = (file.mimetype || '').toLowerCase();
    const name = file.originalname.toLowerCase();
    const pdf = mime === 'application/pdf' || name.endsWith('.pdf');
    const image = mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|tif|heic)$/i.test(name);
    if (type === DocumentType.RESUME && !pdf) {
      throw new BadRequestException({
        error: 'RESUME_PDF_REQUIRED',
        message: 'Resume must be a PDF.',
      });
    }
    if (
      (type === DocumentType.DEGREE ||
        type === DocumentType.MARKSHEET ||
        type === DocumentType.CERTIFICATE) &&
      !pdf &&
      !image
    ) {
      throw new BadRequestException({
        error: 'DOCUMENT_TYPE_INVALID',
        message: `${type.toLowerCase()} must be an image or a PDF.`,
      });
    }
    const max = 12 * 1024 * 1024;
    if (file.size > max) {
      throw new BadRequestException({
        error: 'FILE_TOO_LARGE',
        message: 'File must be 12 MB or smaller.',
      });
    }
  }
}
