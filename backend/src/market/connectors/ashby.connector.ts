import { htmlToText } from '../http/html-to-text';
import type { MarketHttpClient } from '../http/market-http-client';
import { str, toDate, type ConnectorFetchResult, type RawJobPayload, type SourceConnector } from './source-connector';

type AshbyJob = {
  id?: string;
  title?: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  isRemote?: boolean;
  workplaceType?: string;
  isListed?: boolean;
  publishedAt?: string;
  jobUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
};

/** Public Job Postings API: https://developers.ashbyhq.com/docs/public-job-posting-api (GET, no auth). */
export class AshbyConnector implements SourceConnector {
  readonly type = 'ASHBY' as const;
  readonly hosts = ['api.ashbyhq.com'];

  boardUrl(boardToken: string) {
    return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardToken)}?includeCompensation=false`;
  }

  parse(json: unknown): RawJobPayload[] {
    const jobs = (json as { jobs?: AshbyJob[] })?.jobs;
    if (!Array.isArray(jobs)) return [];
    return jobs
      .filter((j) => j && str(j.id) && str(j.title) && j.isListed !== false)
      .map((j) => ({
        externalId: j.id!,
        title: str(j.title)!,
        location: str(j.location),
        descriptionText: j.descriptionHtml ? htmlToText(j.descriptionHtml) : (j.descriptionPlain ?? '').trim(),
        url: str(j.jobUrl),
        postedAt: toDate(j.publishedAt),
        sourceUpdatedAt: null,
        department: str(j.department) ?? str(j.team),
        employmentType: str(j.employmentType),
        workplaceType: str(j.workplaceType) ?? (j.isRemote ? 'Remote' : null),
        raw: j,
      }));
  }

  async fetch(boardToken: string, http: MarketHttpClient): Promise<ConnectorFetchResult> {
    const url = this.boardUrl(boardToken);
    const res = await http.getJson<unknown>(url);
    return { jobs: this.parse(res.data), fetchedUrl: url, robots: res.robots };
  }
}
