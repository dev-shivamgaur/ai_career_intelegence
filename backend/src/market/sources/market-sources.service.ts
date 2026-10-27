import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IntelConfigService } from '../../intel-config/intel-config.service';
import { ConnectorRegistry } from '../connectors/connector-registry';
import { MarketFetchError, MarketHttpClient } from '../http/market-http-client';
import { MarketRetentionService } from '../retention/market-retention.service';
import { MAX_TERMS_REVIEW_DAYS, effectiveRetention, fetchBlocker, termsReviewProblem } from './compliance';
import type {
  CreateCompanyDto,
  CreateMarketSourceDto,
  RecordTermsReviewDto,
  UpdateCompanyDto,
  UpdateMarketSourceDto,
} from './dto/market-sources.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MarketSourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectors: ConnectorRegistry,
    private readonly http: MarketHttpClient,
    private readonly config: IntelConfigService,
    private readonly retention: MarketRetentionService,
  ) {}

  listCompanies() {
    return this.prisma.company.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { sources: true } } } });
  }

  async createCompany(dto: CreateCompanyDto) {
    if (await this.prisma.company.findUnique({ where: { slug: dto.slug } })) {
      throw new ConflictException({ error: 'COMPANY_EXISTS', message: `Company ${dto.slug} already exists` });
    }
    return this.prisma.company.create({ data: dto });
  }

  async updateCompany(id: string, dto: UpdateCompanyDto) {
    await this.requireCompany(id);
    return this.prisma.company.update({ where: { id }, data: dto });
  }

  async listSources() {
    const [sources, retention] = await Promise.all([
      this.prisma.marketSource.findMany({
        orderBy: [{ company: { name: 'asc' } }, { type: 'asc' }],
        include: { company: { select: { id: true, name: true, slug: true, active: true } } },
      }),
      this.config.get('retention'),
    ]);
    const now = new Date();
    return sources.map((s) => ({
      ...s,
      termsProblem: termsReviewProblem(s, now),
      fetchBlocker: fetchBlocker(s, now),
      effectiveRetention: effectiveRetention(s, retention),
    }));
  }

  async getSource(id: string) {
    const source = await this.prisma.marketSource.findUnique({
      where: { id },
      include: { company: true },
    });
    if (!source) throw new NotFoundException({ error: 'SOURCE_NOT_FOUND', message: 'Market source not found' });
    return source;
  }

  async createSource(dto: CreateMarketSourceDto) {
    await this.requireCompany(dto.companyId);
    const existing = await this.prisma.marketSource.findUnique({
      where: { type_boardToken: { type: dto.type, boardToken: dto.boardToken } },
    });
    if (existing) throw new ConflictException({ error: 'SOURCE_EXISTS', message: 'This board is already registered' });
    return this.prisma.marketSource.create({
      data: { companyId: dto.companyId, type: dto.type, boardToken: dto.boardToken, label: dto.label, enabled: false },
    });
  }

  async updateSource(id: string, dto: UpdateMarketSourceDto) {
    await this.getSource(id);
    return this.prisma.marketSource.update({ where: { id }, data: dto });
  }

  /** Records who reviewed which terms and when. Narrowing the allowed uses disables the source. */
  async recordTermsReview(id: string, dto: RecordTermsReviewDto, reviewerId: string) {
    const source = await this.getSource(id);
    const now = new Date();
    const due = new Date(dto.reviewDueAt);
    if (due.getTime() <= now.getTime()) {
      throw new BadRequestException({ error: 'REVIEW_DUE_IN_PAST', message: 'reviewDueAt must be in the future' });
    }
    if (due.getTime() - now.getTime() > MAX_TERMS_REVIEW_DAYS * DAY_MS) {
      throw new BadRequestException({ error: 'REVIEW_DUE_TOO_FAR', message: 'A terms review is valid for at most 12 months' });
    }
    const lostAnalytics = source.allowedUses.includes('ANALYTICS_AGGREGATE') && !dto.allowedUses.includes('ANALYTICS_AGGREGATE');
    const data: Prisma.MarketSourceUpdateInput = {
      termsUrl: dto.termsUrl,
      termsSummary: dto.termsSummary,
      allowedUses: dto.allowedUses,
      attributionRequired: dto.attributionRequired,
      termsReviewDueAt: due,
      termsReviewedAt: now,
      termsReviewedBy: reviewerId,
    };
    if (lostAnalytics || !dto.allowedUses.includes('ANALYTICS_AGGREGATE')) {
      data.enabled = false;
      data.pausedReason = 'TERMS_DO_NOT_ALLOW_ANALYTICS';
    } else if (source.pausedReason === 'TERMS_REVIEW_EXPIRED' || source.pausedReason === 'TERMS_DO_NOT_ALLOW_ANALYTICS') {
      data.pausedReason = null;
    }
    const saved = await this.prisma.marketSource.update({ where: { id }, data });
    const purged = lostAnalytics ? await this.retention.purgeSource(id, 'full') : null;
    return { ...saved, termsNarrowed: lostAnalytics, purged };
  }

  async enable(id: string) {
    const source = await this.getSource(id);
    const problem = termsReviewProblem(source);
    if (problem) {
      throw new BadRequestException({ error: problem, message: `Source cannot be enabled: ${problem}` });
    }
    if (!source.company.active) throw new BadRequestException({ error: 'COMPANY_INACTIVE', message: 'Company is inactive' });
    return this.prisma.marketSource.update({
      where: { id },
      data: { enabled: true, pausedReason: null, consecutiveFailures: 0 },
    });
  }

  async disable(id: string, reason = 'ADMIN_DISABLED') {
    await this.getSource(id);
    return this.prisma.marketSource.update({ where: { id }, data: { enabled: false, pausedReason: reason } });
  }

  /**
   * Dry run: fetches the board through the compliant client and returns a sample. Nothing is stored.
   * Requires a valid terms review (the source need not be enabled yet).
   */
  async testFetch(id: string) {
    const source = await this.getSource(id);
    const problem = termsReviewProblem(source);
    if (problem) throw new BadRequestException({ error: problem, message: `Test fetch blocked: ${problem}` });
    const connector = this.connectors.get(source.type);
    const startedAt = Date.now();
    try {
      const result = await connector.fetch(source.boardToken, this.http);
      await this.prisma.marketSource.update({
        where: { id },
        data: { robotsStatus: result.robots, robotsCheckedAt: new Date() },
      });
      return {
        ok: true,
        fetchedUrl: result.fetchedUrl,
        robots: result.robots,
        durationMs: Date.now() - startedAt,
        jobCount: result.jobs.length,
        sample: result.jobs.map((j) => ({
          externalId: j.externalId,
          title: j.title,
          location: j.location,
          url: j.url,
          postedAt: j.postedAt,
          descriptionChars: j.descriptionText.length,
          descriptionPreview: j.descriptionText.slice(0, 300),
        })),
      };
    } catch (err) {
      const e = err instanceof MarketFetchError ? err : new MarketFetchError('NETWORK', (err as Error).message, true);
      if (e.code === 'ROBOTS_DISALLOWED') {
        await this.prisma.marketSource.update({
          where: { id },
          data: { robotsStatus: 'DISALLOWED', robotsCheckedAt: new Date() },
        });
      }
      return { ok: false, error: e.code, message: e.message, durationMs: Date.now() - startedAt };
    }
  }

  private async requireCompany(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException({ error: 'COMPANY_NOT_FOUND', message: 'Company not found' });
    return company;
  }
}
