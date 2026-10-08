import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Document } from '@langchain/core/documents';
import { QdrantVectorStore } from '@langchain/qdrant';
import { QdrantClient } from '@qdrant/js-client-rest';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../ai/embedding.service';
import { createAppQdrantClient, withTimeout } from '../rag/qdrant-client';

export type SarkariRagHit = {
  id: string;
  title: string;
  content: string;
  source: string;
  sourceUrl?: string;
  examSlug?: string;
  score: number;
};

@Injectable()
export class SarkariRagService implements OnModuleInit {
  private readonly logger = new Logger(SarkariRagService.name);
  private store: QdrantVectorStore | null = null;
  private client: QdrantClient | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
    private readonly config: ConfigService,
  ) {}

  get collection() {
    const explicit = this.config.get<string>('QDRANT_SARKARI_COLLECTION', '').trim();
    if (explicit) return explicit;
    return 'sarkari_knowledge';
  }

  get url() {
    return this.config.get<string>('QDRANT_URL', 'http://localhost:6333');
  }

  async onModuleInit() {
    if (!this.embeddings.isConfigured()) {
      this.logger.warn('Embeddings not configured — sarkari Qdrant ingest skipped.');
      return;
    }
    try {
      this.logger.log(`Sarkari Qdrant collection=${this.collection}`);
      await withTimeout(this.ensureStore(), 8_000, 'Sarkari Qdrant ensureStore');
    } catch (err) {
      this.logger.warn(`Sarkari Qdrant init failed: ${(err as Error).message}`);
      return;
    }
    void this.maybeSyncCorpus();
  }

  async retrieve(query: string, examSlug?: string, limit = 5): Promise<SarkariRagHit[]> {
    try {
      const store = await this.ensureStore();
    const filter = examSlug
      ? {
          should: [
            { key: 'metadata.examSlug', match: { value: examSlug } },
            { key: 'metadata.examSlug', match: { value: 'shared' } },
          ],
        }
      : undefined;
    const pairs = await store.similaritySearchWithScore(query, limit, filter);
    return pairs.map(([doc, score]) => ({
      id: String(doc.metadata.prismaId ?? ''),
      title: String(doc.metadata.title ?? 'Untitled'),
      content: doc.pageContent,
      source: String(doc.metadata.sourceSite ?? doc.metadata.source ?? 'sarkari'),
      sourceUrl: doc.metadata.sourceUrl ? String(doc.metadata.sourceUrl) : undefined,
      examSlug: doc.metadata.examSlug ? String(doc.metadata.examSlug) : undefined,
      score: Number(score.toFixed(4)),
    }));
    } catch (err) {
      this.logger.warn(`Sarkari retrieve failed: ${(err as Error).message}`);
      return [];
    }
  }

  async upsertChunks(
    chunks: Array<{
      key: string;
      title: string;
      content: string;
      kind: string;
      examSlug?: string;
      sourceSite?: string;
      sourceUrl?: string;
    }>,
  ) {
    const store = await this.ensureStore();
    const ready = chunks.filter((c) => c.content.trim().length > 20);
    if (!ready.length) return;
    const docs = ready.map(
      (c) =>
        new Document({
          pageContent: `${c.title}\n${c.content}`.slice(0, 8000),
          metadata: {
            title: c.title,
            kind: c.kind,
            examSlug: c.examSlug ?? 'shared',
            sourceSite: c.sourceSite ?? c.kind,
            sourceUrl: c.sourceUrl ?? '',
            source: c.sourceSite ?? c.kind,
            prismaId: c.key,
            namespace: 'sarkari',
          },
        }),
    );
    await store.addDocuments(docs, { ids: ready.map((c) => this.pointId(c.key)) });
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
      this.logger.warn(`Sarkari corpus sync failed: ${(err as Error).message}`);
    }
  }

  async syncCorpus() {
    const [exams, snapshots, chunks] = await Promise.all([
      this.prisma.governmentExam.findMany({ include: { subjects: true } }),
      this.prisma.sarkariWebSnapshot.findMany({ include: { exam: true } }),
      this.prisma.sarkariKnowledgeChunk.findMany({ include: { exam: true } }),
    ]);

    await this.upsertChunks(
      exams.flatMap((e) => [
        {
          key: `sarkari-exam:${e.id}`,
          title: e.name,
          content: [e.overview, e.eligibility, e.ageLimit, e.educationRequirement, e.stages.join(', '), e.officialNote]
            .filter(Boolean)
            .join('\n'),
          kind: 'syllabus_overview',
          examSlug: e.slug,
          sourceSite: 'catalog',
        },
        ...e.subjects.map((s) => ({
          key: `sarkari-subject:${s.id}`,
          title: `${e.shortName}: ${s.name}`,
          content: `Weightage: ${s.weightage ?? 'n/a'}\nTopics: ${s.topics.join(', ')}`,
          kind: 'syllabus_overview',
          examSlug: e.slug,
          sourceSite: 'catalog',
        })),
      ]),
    );

    await this.upsertChunks(
      snapshots.map((s) => ({
        key: `sarkari-snap:${s.id}`,
        title: s.title,
        content: s.excerpt,
        kind: s.kind,
        examSlug: s.exam.slug,
        sourceSite: s.site,
        sourceUrl: s.url,
      })),
    );

    await this.upsertChunks(
      chunks.map((c) => ({
        key: `sarkari-chunk:${c.id}`,
        title: c.title,
        content: c.content,
        kind: c.kind,
        examSlug: c.exam?.slug,
        sourceSite: c.source ?? 'chunk',
        sourceUrl: c.sourceUrl ?? undefined,
      })),
    );

    this.logger.log(
      `Synced sarkari Qdrant (${exams.length} exams, ${snapshots.length} snapshots, ${chunks.length} chunks).`,
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
