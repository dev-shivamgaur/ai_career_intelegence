import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';

export type PageText = { page: number; text: string };
export type PageImage = { page: number; mimeType: string; buffer: Buffer };

@Injectable()
export class DocumentParseService {
  private readonly logger = new Logger(DocumentParseService.name);

  constructor(private readonly config: ConfigService) {}

  isPdf(mime: string, filename: string) {
    return mime === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
  }

  isImage(mime: string) {
    return mime.startsWith('image/');
  }

  async loadPdfDocuments(buffer: Buffer, filename: string): Promise<Document[]> {
    const path = join(tmpdir(), `${randomUUID()}-${filename.replace(/[^\w.-]+/g, '_')}`);
    await writeFile(path, buffer);
    try {
      const unstructured = await this.unstructuredLoad(path);
      if (unstructured?.length) return unstructured;

      const { PDFLoader } = await import('@langchain/community/document_loaders/fs/pdf');
      const loader = new PDFLoader(path, { splitPages: true });
      const loaded = await this.withTimeout(loader.load(), 15_000, 'PDFLoader');
      const chars = loaded.reduce((n, d) => n + d.pageContent.replace(/\s/g, '').length, 0);
      if (chars >= 80) return loaded;
      this.logger.warn(`PDFLoader text too short (${chars} chars), using pdf-parse`);
      return this.pdfParseFallback(buffer);
    } catch (err) {
      this.logger.warn(`PDFLoader failed, using pdf-parse: ${(err as Error).message}`);
      return this.pdfParseFallback(buffer);
    } finally {
      await unlink(path).catch(() => undefined);
    }
  }

  async splitDocuments(docs: Document[]) {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1800,
      chunkOverlap: 200,
    });
    return splitter.splitDocuments(docs.filter((d) => d.pageContent.trim().length > 0));
  }

  pagesFromDocs(docs: Document[]): PageText[] {
    return docs.map((d, i) => ({
      page: Number(d.metadata?.loc?.pageNumber ?? d.metadata?.page ?? i + 1),
      text: d.pageContent.trim(),
    }));
  }

  needsOcr(pages: PageText[]) {
    if (!pages.length) return true;
    const chars = pages.reduce((n, p) => n + p.text.replace(/\s+/g, '').length, 0);
    return chars < 80 * Math.max(1, pages.length);
  }

  async rasterizePdf(buffer: Buffer, maxPages = 3): Promise<PageImage[]> {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const shots = await this.withTimeout(
        parser.getScreenshot({ first: maxPages, scale: 1.15, imageBuffer: true }),
        20_000,
        'PDF screenshot',
      );
      return shots.pages.map((page) => ({
        page: page.pageNumber,
        mimeType: 'image/png',
        buffer: Buffer.from(page.data),
      }));
    } finally {
      await parser.destroy();
    }
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async unstructuredLoad(path: string): Promise<Document[] | null> {
    const apiUrl = this.config.get<string>('UNSTRUCTURED_API_URL', '').trim();
    if (!apiUrl) return null;
    try {
      const { UnstructuredLoader } = await import(
        '@langchain/community/document_loaders/fs/unstructured'
      );
      const loader = new UnstructuredLoader(path, {
        apiUrl,
        apiKey: this.config.get<string>('UNSTRUCTURED_API_KEY', '').trim() || undefined,
        strategy: 'hi_res',
      });
      const docs = await loader.load();
      return docs.length ? docs : null;
    } catch (err) {
      this.logger.warn(`Unstructured loader skipped: ${(err as Error).message}`);
      return null;
    }
  }

  private async pdfParseFallback(buffer: Buffer): Promise<Document[]> {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const parsed = await parser.getText();
      const pages = parsed.pages.length
        ? parsed.pages
        : [{ num: 1, text: parsed.text }];
      return pages
        .filter((p) => p.text.trim())
        .map(
          (p) =>
            new Document({
              pageContent: p.text.trim(),
              metadata: { page: p.num, source: 'pdf-parse' },
            }),
        );
    } finally {
      await parser.destroy();
    }
  }
}
