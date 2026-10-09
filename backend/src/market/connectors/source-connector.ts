import type { MarketSourceType } from '../../prisma/client';
import type { MarketHttpClient } from '../http/market-http-client';

/** One posting as returned by a board, before normalization. */
export type RawJobPayload = {
  externalId: string;
  title: string;
  location: string | null;
  descriptionText: string;
  url: string | null;
  postedAt: Date | null;
  sourceUpdatedAt: Date | null;
  department: string | null;
  employmentType: string | null;
  workplaceType: string | null;
  raw: unknown;
};

export type ConnectorFetchResult = {
  jobs: RawJobPayload[];
  fetchedUrl: string;
  robots: 'ALLOWED' | 'DISALLOWED' | 'UNKNOWN';
};

export interface SourceConnector {
  readonly type: MarketSourceType;
  readonly hosts: string[];
  boardUrl(boardToken: string): string;
  /** Pure parsing of a board response. Tested against recorded fixtures. */
  parse(json: unknown): RawJobPayload[];
  fetch(boardToken: string, http: MarketHttpClient): Promise<ConnectorFetchResult>;
}

export function validBoardToken(token: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(token);
}

export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = typeof value === 'number' ? new Date(value) : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.replace(/\s+/g, ' ').trim();
  return t || null;
}
