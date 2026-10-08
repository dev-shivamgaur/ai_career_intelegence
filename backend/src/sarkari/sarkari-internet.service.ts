import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GovernmentExamCategory } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WebResearchService } from '../web/web-research.service';
import { SarkariRagService } from './sarkari-rag.service';

const ALLOWED_HOSTS = new Set([
  'sarkariresult.com',
  'www.sarkariresult.com',
  'ssc.gov.in',
  'www.ssc.gov.in',
  'upsc.gov.in',
  'www.upsc.gov.in',
  'ibps.in',
  'www.ibps.in',
  'rrbcdg.gov.in',
  'www.rrbcdg.gov.in',
  'indianrailways.gov.in',
  'www.indianrailways.gov.in',
  'ncs.gov.in',
  'www.ncs.gov.in',
  'employmentnews.gov.in',
  'www.employmentnews.gov.in',
]);

const SITES_BY_CATEGORY: Record<GovernmentExamCategory, string[]> = {
  SSC: ['https://www.sarkariresult.com/', 'https://ssc.gov.in/'],
  UPSC: ['https://www.sarkariresult.com/', 'https://www.upsc.gov.in/'],
  BANKING: ['https://www.sarkariresult.com/', 'https://www.ibps.in/'],
  RAILWAY: ['https://www.sarkariresult.com/', 'https://www.rrbcdg.gov.in/'],
  DEFENCE: ['https://www.sarkariresult.com/', 'https://www.ncs.gov.in/'],
  STATE: ['https://www.sarkariresult.com/', 'https://www.employmentnews.gov.in/'],
  TEACHING: ['https://www.sarkariresult.com/', 'https://www.ncs.gov.in/'],
};

@Injectable()
export class SarkariInternetService {
  private readonly logger = new Logger(SarkariInternetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly web: WebResearchService,
    private readonly rag: SarkariRagService,
  ) {}

  async refreshForUser(userId: string) {
    const plan = await this.prisma.governmentExamPlan.findFirst({
      where: { userId, isActive: true },
      include: { exam: true },
    });
    if (!plan) {
      throw new NotFoundException({
        error: 'NO_PLAN',
        message: 'Start a sarkari exam plan before refreshing notices.',
      });
    }
    return this.refreshForExam(plan.examId);
  }

  async refreshForExam(examId: string) {
    const exam = await this.prisma.governmentExam.findUnique({ where: { id: examId } });
    if (!exam) {
      throw new NotFoundException({ error: 'EXAM_NOT_FOUND', message: 'Exam not found' });
    }

    const urls = SITES_BY_CATEGORY[exam.category] ?? ['https://www.sarkariresult.com/'];
    const saved: Array<{ url: string; site: string; title: string; ok: boolean }> = [];

    for (const url of urls) {
      if (!this.allowed(url)) {
        saved.push({ url, site: hostOf(url), title: '', ok: false });
        continue;
      }
      try {
        const text = (await this.web.fetchText(url)).slice(0, 4000);
        const title = `${exam.shortName} colour from ${hostOf(url)}`;
        const excerpt = [
          `Query: ${exam.name} (${exam.conductingBody}).`,
          'Unofficial listing or board homepage excerpt — verify on the official notification PDF.',
          text.slice(0, 1800),
        ].join('\n');
        const row = await this.prisma.sarkariWebSnapshot.upsert({
          where: { examId_url: { examId: exam.id, url } },
          update: { title, excerpt, site: hostOf(url), kind: 'news', fetchedAt: new Date() },
          create: {
            examId: exam.id,
            url,
            site: hostOf(url),
            title,
            excerpt,
            kind: 'news',
          },
        });
        await this.rag
          .upsertChunks([
            {
              key: `sarkari-snap:${row.id}`,
              title: row.title,
              content: row.excerpt,
              kind: row.kind,
              examSlug: exam.slug,
              sourceSite: row.site,
              sourceUrl: row.url,
            },
          ])
          .catch((err) => this.logger.warn(`Sarkari embed skipped: ${(err as Error).message}`));
        saved.push({ url, site: hostOf(url), title, ok: true });
      } catch (err) {
        this.logger.warn(`Sarkari fetch failed ${url}: ${(err as Error).message}`);
        saved.push({ url, site: hostOf(url), title: '', ok: false });
      }
    }

    const snapshots = await this.listForExam(exam.id);
    return {
      exam: { slug: exam.slug, shortName: exam.shortName },
      fetched: saved,
      note: 'Internet colour only. Eligibility still comes from your papers and the catalog exam row. Verify official notices.',
      snapshots,
    };
  }

  async listForExam(examId: string) {
    const rows = await this.prisma.sarkariWebSnapshot.findMany({
      where: { examId },
      orderBy: { fetchedAt: 'desc' },
      take: 12,
    });
    return rows.map((r) => ({
      id: r.id,
      url: r.url,
      site: r.site,
      title: r.title,
      excerpt: r.excerpt.slice(0, 400),
      kind: r.kind,
      fetchedAt: r.fetchedAt,
    }));
  }

  private allowed(url: string) {
    try {
      return ALLOWED_HOSTS.has(new URL(url).hostname.toLowerCase());
    } catch {
      return false;
    }
  }
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
