import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Document } from '@langchain/core/documents';
import { QdrantVectorStore } from '@langchain/qdrant';
import { QdrantClient } from '@qdrant/js-client-rest';
import { preferIpv4Loopback } from '../common/loopback';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../ai/embedding.service';
import { createAppQdrantClient, withTimeout } from './qdrant-client';

export type RagHit = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  source: string;
  score: number;
};

@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);
  private store: QdrantVectorStore | null = null;
  private client: QdrantClient | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
    private readonly config: ConfigService,
  ) {}

  get collection() {
    const explicit = this.config.get<string>('QDRANT_COLLECTION', '').trim();
    if (explicit) return explicit;
    return this.embeddings.provider() === 'ollama' ? 'career_knowledge_qwen' : 'career_knowledge';
  }

  get url() {
    return preferIpv4Loopback(this.config.get<string>('QDRANT_URL', 'http://127.0.0.1:6333'));
  }

  async onModuleInit() {
    if (!this.embeddings.isConfigured()) {
      this.logger.warn('Embeddings not configured — Qdrant ingest skipped.');
      return;
    }
    try {
      this.logger.log(
        `Qdrant collection=${this.collection} embeddings=${this.embeddings.provider()} dim=${this.embeddings.dimensions()}`,
      );
      await withTimeout(this.ensureStore(), 8_000, 'Qdrant ensureStore');
    } catch (err) {
      this.logger.warn(`Qdrant init failed: ${(err as Error).message}. Is docker compose qdrant running on 6333?`);
      return;
    }
    void this.maybeSyncCorpus();
  }

  async retrieve(query: string, userId?: string, limit = 5): Promise<RagHit[]> {
    const store = await this.ensureStore();
    const filter = userId
      ? {
          should: [
            { key: 'metadata.namespace', match: { value: 'shared' } },
            { key: 'metadata.userId', match: { value: userId } },
          ],
        }
      : { must: [{ key: 'metadata.namespace', match: { value: 'shared' } }] };

    const pairs = await store.similaritySearchWithScore(query, limit, filter);
    return pairs.map(([doc, score]) => ({
      id: String(doc.metadata.prismaId ?? doc.metadata.id ?? ''),
      title: String(doc.metadata.title ?? 'Untitled'),
      content: doc.pageContent,
      tags: Array.isArray(doc.metadata.tags) ? doc.metadata.tags.map(String) : [],
      source: String(doc.metadata.source ?? doc.metadata.kind ?? 'qdrant'),
      score: Number(score.toFixed(4)),
    }));
  }

  async buildContext(query: string, userId?: string): Promise<string> {
    const hits = await this.retrieve(query, userId, 5);
    if (!hits.length) {
      return 'No matching knowledge in Qdrant for this query.';
    }
    return hits
      .map((h) => `[${h.title} | ${h.source} | score ${h.score}]\n${h.content}`)
      .join('\n\n');
  }

  async upsertChunks(
    chunks: Array<{
      key: string;
      title: string;
      content: string;
      source?: string;
      kind: string;
      namespace: 'shared' | 'user';
      userId?: string;
      tags?: string[];
    }>,
  ) {
    const store = await this.ensureStore();
    const docs = chunks
      .filter((c) => c.content.trim().length > 20)
      .map(
        (c) =>
          new Document({
            pageContent: `${c.title}\n${c.content}`.slice(0, 8000),
            metadata: {
              title: c.title,
              source: c.source ?? c.kind,
              kind: c.kind,
              namespace: c.namespace,
              userId: c.namespace === 'user' ? c.userId : 'shared',
              tags: c.tags ?? [],
              prismaId: c.key,
            },
          }),
      );
    if (!docs.length) return;
    await store.addDocuments(docs, { ids: chunks.filter((c) => c.content.trim().length > 20).map((c) => this.pointId(c.key)) });
  }

  async ingestUserText(userId: string, key: string, title: string, content: string, kind: string, tags: string[] = []) {
    await this.upsertChunks([
      {
        key: `${userId}:${key}`,
        title,
        content,
        kind,
        namespace: 'user',
        userId,
        tags,
        source: kind,
      },
    ]);
  }

  private forceSyncOnStart() {
    return this.config.get<string>('RAG_SYNC_ON_START', 'false').trim().toLowerCase() === 'true';
  }

  private async maybeSyncCorpus() {
    try {
      if (!this.forceSyncOnStart() && this.client) {
        const info = await this.client.getCollection(this.collection);
        const points = Number(info.points_count ?? 0);
        if (points > 0) {
          this.logger.log(`Qdrant ${this.collection} already has ${points} points — skipping startup re-embed`);
          return;
        }
      }
      await this.syncCorpus();
    } catch (err) {
      this.logger.warn(`Qdrant corpus sync failed: ${(err as Error).message}`);
    }
  }

  async syncCorpus() {
    const [chunks, careers, jobs] = await Promise.all([
      this.prisma.knowledgeChunk.findMany(),
      this.prisma.career.findMany({ include: { requirements: { include: { skill: true } } } }),
      this.prisma.job.findMany({
        where: { isDemo: false },
        include: { skills: { include: { skill: true } } },
      }),
    ]);

    await this.upsertChunks(
      chunks.map((c) => ({
        key: `knowledge:${c.id}`,
        title: c.title,
        content: c.content,
        tags: c.tags,
        source: c.source ?? 'knowledge_chunk',
        kind: 'knowledge',
        namespace: 'shared' as const,
      })),
    );

    await this.upsertChunks(
      careers.map((c) => ({
        key: `career:${c.id}`,
        title: c.title,
        content: [c.overview, c.marketExpectations, c.entryLevelExpectations, c.requirements.map((r) => `${r.skill.name} (${r.type}/${r.importance})`).join(', ')].join('\n'),
        kind: 'career',
        namespace: 'shared',
        source: c.slug,
        tags: [c.slug],
      })),
    );

    await this.upsertChunks(
      jobs.map((j) => ({
        key: `job:${j.id}`,
        title: `${j.company} — ${j.role}`,
        content: [j.description, j.whyMatches, j.skills.map((s) => s.skill.name).join(', ')].filter(Boolean).join('\n'),
        kind: 'job',
        namespace: 'shared',
        source: j.company,
        tags: j.skills.map((s) => s.skill.name),
      })),
    );

    const docs = await this.prisma.document.findMany({
      include: { extraction: true },
    });
    await this.upsertChunks(
      docs
        .filter((d) => d.extraction)
        .map((d) => ({
          key: `document:${d.id}`,
          title: d.filename,
          content: [
            d.extraction?.summary,
            d.extraction?.degree,
            (d.extraction?.skillsDetected ?? []).join(', '),
          ]
            .filter(Boolean)
            .join('\n'),
          kind: 'document',
          namespace: 'user' as const,
          userId: d.userId,
          tags: [d.type],
          source: d.filename,
        })),
    );

    this.logger.log(
      `Synced Qdrant corpus (${chunks.length} chunks, ${careers.length} careers, ${jobs.length} jobs).`,
    );
  }

  private async ensureStore() {
    if (this.store) return this.store;
    const apiKey = this.config.get<string>('QDRANT_API_KEY', '').trim() || undefined;
    this.client = createAppQdrantClient(this.url, apiKey);
    const existing = await this.client.getCollections();
    if (!existing.collections.some((c) => c.name === this.collection)) {
      await this.client.createCollection(this.collection, {
        vectors: { size: this.embeddings.dimensions(), distance: 'Cosine' },
      });
    }
    this.store = await QdrantVectorStore.fromExistingCollection(this.embeddings.langchain(), {
      url: this.url,
      apiKey,
      collectionName: this.collection,
    });
    return this.store;
  }

  private pointId(key: string) {
    const hex = createHash('sha256').update(key).digest('hex').slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
}
