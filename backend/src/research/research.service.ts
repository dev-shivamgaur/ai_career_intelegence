import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ResearchStatus, SourceQuality, SourceType } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgentService } from '../ai/agent.service';
import { RagService } from '../rag/rag.service';
import { WebResearchService } from '../web/web-research.service';
import { RoadmapCorpusService } from '../web/roadmap-corpus.service';
import { CreateResearchDto } from './dto/research.dto';

@Injectable()
export class ResearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: AgentService,
    private readonly rag: RagService,
    private readonly web: WebResearchService,
    private readonly corpus: RoadmapCorpusService,
  ) {}

  async create(userId: string, dto: CreateResearchDto) {
    const now = new Date();
    const goal = await this.prisma.careerGoal.findFirst({
      where: { userId, isActive: true },
      include: { career: true },
    });
    const query = dto.query?.trim()
      ? dto.query
      : `${goal?.career.title ?? 'career'} ${goal?.career.slug ?? ''} skills demand India`.trim();

    if (goal) {
      try {
        await this.corpus.syncCareer(goal.career.slug);
      } catch {
        /* live research still proceeds without a fresh syllabus */
      }
    }

    const live = await this.web.searchMarket(query);
    if (live.length) {
      await this.rag.upsertChunks(
        live.slice(0, 10).map((h, i) => ({
          key: `web:${userId}:${Date.now()}:${i}`,
          title: h.title,
          content: `${h.snippet}\n${h.url}`,
          kind: 'web',
          namespace: 'user' as const,
          userId,
          tags: [h.source, goal?.career.slug ?? 'research'],
          source: h.url,
        })),
      );
    }

    const liveSources = live.slice(0, 8).map((h) => ({
      title: h.title.slice(0, 180),
      type: this.sourceType(h.source),
      domain: this.hostname(h.url) || h.source,
      quality: h.source === 'wikipedia' ? SourceQuality.TRUSTED : SourceQuality.ESTABLISHED,
      keyFinding: (h.snippet || h.title).slice(0, 400),
      usedInRecommendation: true,
      confidence: h.source === 'wikipedia' ? 82 : 68,
      url: h.url,
    }));

    let report: Awaited<ReturnType<AgentService['research']>>;
    try {
      report = await this.agent.research(userId, query);
    } catch {
      report = {
        summary:
          live
            .slice(0, 6)
            .map((h) => `${h.title}: ${h.snippet}`)
            .join(' ')
            .slice(0, 1200) ||
          `Live scan for ${query}. Wikipedia, Google News, and web search returned no rows this run.`,
        skillPatterns: live.length,
        sources: liveSources,
        findings: [
          {
            title: 'Live market scan',
            content: live.map((h) => `${h.title} (${h.url})`).join('\n') || query,
            tags: ['web', 'wikipedia', 'rss'],
          },
        ],
      };
    }

    const seen = new Set(liveSources.map((s) => s.url).filter(Boolean));
    const mergedSources = [
      ...liveSources,
      ...report.sources.filter((s) => !s.url || !seen.has(s.url)),
    ].slice(0, 16);

    const timeline = [
      { id: 't1', label: 'Research started', timestamp: now.toISOString(), status: 'done' },
      { id: 't2', label: `Fetched ${live.length} live sources (Wikipedia, Google News, web)`, timestamp: now.toISOString(), status: 'done' },
      { id: 't3', label: goal ? `Loaded ${goal.career.title} syllabus into knowledge store` : 'No career selected', timestamp: now.toISOString(), status: 'done' },
      { id: 't4', label: 'Agent report generated', timestamp: now.toISOString(), status: 'done' },
    ];

    const jobDescriptions = mergedSources.filter((s) => s.type === 'JOB').length;
    const learningResources = mergedSources.filter((s) => s.type === 'LEARNING').length;
    const governmentSources = mergedSources.filter((s) => s.type === 'GOVERNMENT').length;

    const findings = report.findings.length
      ? report.findings
      : [{ title: 'Live market scan', content: query, tags: ['web'] }];

    const session = await this.prisma.researchSession.create({
      data: {
        userId,
        query,
        status: ResearchStatus.COMPLETED,
        summary: report.summary,
        sourcesAnalyzed: mergedSources.length,
        jobDescriptions,
        learningResources,
        governmentSources,
        skillPatterns: report.skillPatterns,
        verificationStatus: 'completed',
        timeline: timeline as unknown as Prisma.InputJsonValue,
        sources: {
          create: mergedSources.map((s) => ({
            title: s.title,
            type: s.type as SourceType,
            domain: s.domain,
            quality: s.quality as SourceQuality,
            keyFinding: s.keyFinding,
            usedInRecommendation: s.usedInRecommendation,
            confidence: s.confidence,
            url: s.url,
          })),
        },
        findings: {
          create: findings.map((f) => ({
            title: f.title,
            content: f.content,
            tags: f.tags ?? [],
          })),
        },
      },
      include: { sources: true, findings: true },
    });

    await this.rag.upsertChunks(
      session.findings.map((f) => ({
        key: `finding:${f.id}`,
        title: f.title,
        content: f.content,
        kind: 'research',
        namespace: 'user',
        userId,
        tags: f.tags,
        source: 'research_finding',
      })),
    );

    return session;
  }

  async latest(userId: string) {
    return this.prisma.researchSession.findFirst({
      where: { userId },
      include: { sources: true, findings: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(userId: string, id: string) {
    const session = await this.prisma.researchSession.findFirst({
      where: { id, userId },
      include: { sources: true, findings: true },
    });
    if (!session) {
      throw new NotFoundException({ error: 'RESEARCH_NOT_FOUND', message: 'Research session not found' });
    }
    return session;
  }

  async sources(userId: string, id: string) {
    const session = await this.get(userId, id);
    return session.sources;
  }

  private sourceType(source: 'wikipedia' | 'rss' | 'web' | 'roadmap.sh'): SourceType {
    if (source === 'wikipedia') return SourceType.LEARNING;
    if (source === 'rss') return SourceType.JOB;
    if (source === 'roadmap.sh') return SourceType.CAREER_GUIDE;
    return SourceType.COMMUNITY;
  }

  private hostname(url: string) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }
}
