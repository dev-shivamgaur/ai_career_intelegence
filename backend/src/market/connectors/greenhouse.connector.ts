import { decodeEntities, htmlToText } from '../http/html-to-text';
import type { MarketHttpClient } from '../http/market-http-client';
import { str, toDate, type ConnectorFetchResult, type RawJobPayload, type SourceConnector } from './source-connector';

type GreenhouseJob = {
  id?: number | string;
  title?: string;
  updated_at?: string;
  first_published?: string;
  absolute_url?: string;
  content?: string;
  location?: { name?: string };
  departments?: Array<{ name?: string }>;
  metadata?: unknown;
};

/** Public Job Board API: https://developers.greenhouse.io/job-board.html (GET, no auth). */
export class GreenhouseConnector implements SourceConnector {
  readonly type = 'GREENHOUSE' as const;
  readonly hosts = ['boards-api.greenhouse.io'];

  boardUrl(boardToken: string) {
    return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`;
  }

  parse(json: unknown): RawJobPayload[] {
    const jobs = (json as { jobs?: GreenhouseJob[] })?.jobs;
    if (!Array.isArray(jobs)) return [];
    return jobs
      .filter((j) => j && j.id !== undefined && str(j.title))
      .map((j) => ({
        externalId: String(j.id),
        title: str(j.title)!,
        location: str(j.location?.name),
        // Greenhouse returns entity-encoded HTML in `content`.
        descriptionText: htmlToText(decodeEntities(j.content ?? '')),
        url: str(j.absolute_url),
        postedAt: toDate(j.first_published),
        sourceUpdatedAt: toDate(j.updated_at),
        department: str(j.departments?.[0]?.name),
        employmentType: null,
        workplaceType: null,
        raw: j,
      }));
  }

  async fetch(boardToken: string, http: MarketHttpClient): Promise<ConnectorFetchResult> {
    const url = this.boardUrl(boardToken);
    const res = await http.getJson<unknown>(url);
    return { jobs: this.parse(res.data), fetchedUrl: url, robots: res.robots };
  }
}
