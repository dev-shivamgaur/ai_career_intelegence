import { htmlToText } from '../http/html-to-text';
import type { MarketHttpClient } from '../http/market-http-client';
import { str, toDate, type ConnectorFetchResult, type RawJobPayload, type SourceConnector } from './source-connector';

type LeverPosting = {
  id?: string;
  text?: string;
  createdAt?: number;
  hostedUrl?: string;
  workplaceType?: string;
  categories?: { location?: string; team?: string; department?: string; commitment?: string };
  description?: string;
  descriptionPlain?: string;
  lists?: Array<{ text?: string; content?: string }>;
  additional?: string;
  additionalPlain?: string;
};

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

/** Public Postings API: https://github.com/lever/postings-api (GET, no auth). */
export class LeverConnector implements SourceConnector {
  readonly type = 'LEVER' as const;
  readonly hosts = ['api.lever.co'];

  boardUrl(boardToken: string, skip = 0) {
    return `https://api.lever.co/v0/postings/${encodeURIComponent(boardToken)}?mode=json&limit=${PAGE_SIZE}&skip=${skip}`;
  }

  parse(json: unknown): RawJobPayload[] {
    if (!Array.isArray(json)) return [];
    return (json as LeverPosting[])
      .filter((p) => p && str(p.id) && str(p.text))
      .map((p) => {
        // Lever splits the posting into an intro, titled lists (Requirements, ...) and a closing block.
        const listText = (p.lists ?? [])
          .map((l) => `${str(l.text) ?? ''}\n${htmlToText(`<ul>${l.content ?? ''}</ul>`)}`)
          .join('\n\n');
        const intro = p.descriptionPlain ?? htmlToText(p.description ?? '');
        const outro = p.additionalPlain ?? htmlToText(p.additional ?? '');
        return {
          externalId: p.id!,
          title: str(p.text)!,
          location: str(p.categories?.location),
          descriptionText: [intro, listText, outro].map((s) => s.trim()).filter(Boolean).join('\n\n'),
          url: str(p.hostedUrl),
          postedAt: toDate(p.createdAt),
          sourceUpdatedAt: null,
          department: str(p.categories?.department) ?? str(p.categories?.team),
          employmentType: str(p.categories?.commitment),
          workplaceType: str(p.workplaceType),
          raw: p,
        };
      });
  }

  async fetch(boardToken: string, http: MarketHttpClient): Promise<ConnectorFetchResult> {
    const jobs: RawJobPayload[] = [];
    let robots: ConnectorFetchResult['robots'] = 'UNKNOWN';
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const res = await http.getJson<unknown>(this.boardUrl(boardToken, page * PAGE_SIZE));
      robots = res.robots;
      const batch = this.parse(res.data);
      jobs.push(...batch);
      if (!Array.isArray(res.data) || res.data.length < PAGE_SIZE) break;
    }
    return { jobs, fetchedUrl: this.boardUrl(boardToken), robots };
  }
}
