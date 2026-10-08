import { Injectable, Logger } from '@nestjs/common';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';

export type WebHit = {
  title: string;
  url: string;
  snippet: string;
  source: 'wikipedia' | 'rss' | 'web' | 'roadmap.sh';
};

/**
 * Live internet lookups. Nothing is stored here — callers decide what to persist
 * (short KnowledgeChunk rows + Qdrant embeddings). Avoids keeping a local copy
 * of the whole web.
 */
@Injectable()
export class WebResearchService {
  private readonly logger = new Logger(WebResearchService.name);

  async fetchText(url: string): Promise<string> {
    const res = await this.get(url);
    const html = await res.text();
    return this.toText(html);
  }

  async fetchJson<T = unknown>(url: string): Promise<T | null> {
    try {
      const res = await this.get(url, { Accept: 'application/json' });
      if (!res.ok) return null;
      const type = res.headers.get('content-type') ?? '';
      if (!type.includes('json') && !type.includes('text/plain')) return null;
      return (await res.json()) as T;
    } catch (err) {
      this.logger.warn(`JSON fetch failed ${url}: ${(err as Error).message}`);
      return null;
    }
  }

  /** First section of a Wikipedia page, plain text. Short enough to store as a note, not the article. */
  async wikipediaExtract(title: string): Promise<{ title: string; extract: string; url: string } | null> {
    const url =
      'https://en.wikipedia.org/w/api.php?' +
      new URLSearchParams({
        action: 'query',
        prop: 'extracts',
        exintro: '1',
        explaintext: '1',
        redirects: '1',
        titles: title,
        format: 'json',
        origin: '*',
      }).toString();
    const json = await this.fetchJson<{
      query?: { pages?: Record<string, { title?: string; extract?: string; pageid?: number; missing?: string }> };
    }>(url);
    const page = Object.values(json?.query?.pages ?? {}).find((row) => row.extract && !row.missing);
    if (!page?.extract) return null;
    return {
      title: page.title || title,
      extract: page.extract.replace(/\s+/g, ' ').trim().slice(0, 700),
      url: page.pageid ? `https://en.wikipedia.org/?curid=${page.pageid}` : `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    };
  }

  async wikipedia(query: string, limit = 5): Promise<WebHit[]> {
    const url =
      'https://en.wikipedia.org/w/api.php?' +
      new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: query,
        srlimit: String(limit),
        format: 'json',
        origin: '*',
      }).toString();
    const json = await this.fetchJson<{
      query?: { search?: Array<{ title: string; snippet: string; pageid: number }> };
    }>(url);
    return (json?.query?.search ?? []).map((row) => ({
      title: row.title,
      url: `https://en.wikipedia.org/?curid=${row.pageid}`,
      snippet: this.toText(row.snippet || ''),
      source: 'wikipedia' as const,
    }));
  }

  async googleNewsRss(query: string, limit = 8): Promise<WebHit[]> {
    const url =
      'https://news.google.com/rss/search?' +
      new URLSearchParams({
        q: query,
        hl: 'en-IN',
        gl: 'IN',
        ceid: 'IN:en',
      }).toString();
    return this.parseRss(url, limit);
  }

  async duckDuckGo(query: string): Promise<WebHit[]> {
    const url =
      'https://api.duckduckgo.com/?' +
      new URLSearchParams({ q: query, format: 'json', no_html: '1', skip_disambig: '1' }).toString();
    const json = await this.fetchJson<{
      Abstract?: string;
      AbstractURL?: string;
      Heading?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    }>(url);
    const hits: WebHit[] = [];
    if (json?.Abstract) {
      hits.push({
        title: json.Heading || query,
        url: json.AbstractURL || 'https://duckduckgo.com',
        snippet: json.Abstract,
        source: 'web',
      });
    }
    for (const t of json?.RelatedTopics ?? []) {
      if (t.Text && t.FirstURL) {
        hits.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text, source: 'web' });
      }
    }
    return hits.slice(0, 8);
  }

  async searchMarket(query: string): Promise<WebHit[]> {
    const [wiki, news, ddg] = await Promise.allSettled([
      this.wikipedia(query, 4),
      this.googleNewsRss(query, 6),
      this.duckDuckGo(query),
    ]);
    const hits = [
      ...(wiki.status === 'fulfilled' ? wiki.value : []),
      ...(news.status === 'fulfilled' ? news.value : []),
      ...(ddg.status === 'fulfilled' ? ddg.value : []),
    ];
    const seen = new Set<string>();
    return hits.filter((h) => {
      if (!h.url || seen.has(h.url)) return false;
      seen.add(h.url);
      return true;
    });
  }

  async searchMarketJson(query: string): Promise<string> {
    const hits = await this.searchMarket(query);
    if (!hits.length) {
      return JSON.stringify({ query, hits: [], note: 'No live results. Network may be blocked.' });
    }
    return JSON.stringify({
      query,
      hits: hits.slice(0, 12).map((h) => ({
        title: h.title,
        url: h.url,
        snippet: h.snippet.slice(0, 400),
        source: h.source,
      })),
    });
  }

  private async parseRss(url: string, limit: number): Promise<WebHit[]> {
    try {
      const res = await this.get(url);
      const xml = await res.text();
      const parser = new Parser();
      const feed = await parser.parseString(xml);
      return (feed.items ?? []).slice(0, limit).map((item) => ({
        title: item.title || '',
        url: item.link || item.guid || url,
        snippet: this.toText(item.contentSnippet || item.content || '').slice(0, 400),
        source: 'rss' as const,
      }));
    } catch (err) {
      this.logger.warn(`RSS failed ${url}: ${(err as Error).message}`);
      return [];
    }
  }

  private toText(html: string) {
    const $ = cheerio.load(html || '');
    $('script, style, noscript').remove();
    return ($('body').text() || $.root().text() || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async get(url: string, extra: Record<string, string> = {}) {
    let last: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'AI-Career-Intelligence/1.0 (learning corpus)',
            Accept: 'text/html,application/json,application/rss+xml,text/xml;q=0.9,*/*;q=0.8',
            ...extra,
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} for ${url}`);
        }
        return res;
      } catch (err) {
        last = err as Error;
        const message = last.message || '';
        if (message.startsWith('HTTP ')) break;
      }
    }
    const nested = (last as { cause?: unknown } | null)?.cause;
    const cause = nested instanceof Error ? nested.message : '';
    throw new Error(cause ? `${last?.message} (${cause})` : last?.message || 'fetch failed');
  }
}
