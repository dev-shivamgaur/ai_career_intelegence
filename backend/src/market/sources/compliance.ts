import type { MarketDisplayPolicy } from '../../prisma/client';

export const ALLOWED_USES = ['ANALYTICS_AGGREGATE', 'DISPLAY_SNIPPET', 'DISPLAY_LINK_ONLY'] as const;
export type AllowedUse = (typeof ALLOWED_USES)[number];

/** Terms reviews expire; a review may be valid for at most this long. */
export const MAX_TERMS_REVIEW_DAYS = 366;

type TermsFields = {
  termsReviewedAt: Date | null;
  termsReviewDueAt: Date | null;
  allowedUses: string[];
};

/** Null when the recorded terms review permits aggregate analytics today. */
export function termsReviewProblem(source: TermsFields, now = new Date()): string | null {
  if (!source.termsReviewedAt) return 'TERMS_NOT_REVIEWED';
  if (!source.termsReviewDueAt) return 'TERMS_REVIEW_DUE_DATE_MISSING';
  if (source.termsReviewDueAt.getTime() <= now.getTime()) return 'TERMS_REVIEW_EXPIRED';
  if (!source.allowedUses.includes('ANALYTICS_AGGREGATE')) return 'ANALYTICS_USE_NOT_ALLOWED';
  return null;
}

/** Null when the scheduler or a consumer may fetch this source now. robots.txt is checked separately per request. */
export function fetchBlocker(
  source: TermsFields & { enabled: boolean; pausedReason: string | null; company?: { active: boolean } | null },
  now = new Date(),
): string | null {
  const terms = termsReviewProblem(source, now);
  if (terms) return terms;
  if (!source.enabled) return 'SOURCE_DISABLED';
  if (source.pausedReason) return `PAUSED: ${source.pausedReason}`;
  if (source.company && !source.company.active) return 'COMPANY_INACTIVE';
  return null;
}

export type RetentionDefaults = {
  storeRawPayload: boolean;
  rawPayloadRetentionDays: number;
  descriptionRetentionDays: number;
  evidenceExcerptMaxChars: number;
};

export type SourceRetention = {
  storeRawPayload: boolean;
  rawPayloadRetentionDays: number | null;
  descriptionRetentionDays: number | null;
  evidenceExcerptMaxChars: number | null;
  displayPolicy: MarketDisplayPolicy;
  allowedUses: string[];
};

export type EffectiveRetention = RetentionDefaults & { displayPolicy: MarketDisplayPolicy };

const DISPLAY_STRICTNESS: Record<MarketDisplayPolicy, number> = { SNIPPET_AND_LINK: 0, LINK_ONLY: 1, NONE: 2 };

/** A source can only be stricter than the global defaults, never looser. */
export function effectiveRetention(source: SourceRetention, defaults: RetentionDefaults): EffectiveRetention {
  const stricter = (value: number | null, global: number) => (value === null ? global : Math.min(value, global));
  let displayPolicy = source.displayPolicy;
  const termsDisplay: MarketDisplayPolicy = source.allowedUses.includes('DISPLAY_SNIPPET')
    ? 'SNIPPET_AND_LINK'
    : source.allowedUses.includes('DISPLAY_LINK_ONLY')
      ? 'LINK_ONLY'
      : 'NONE';
  if (DISPLAY_STRICTNESS[termsDisplay] > DISPLAY_STRICTNESS[displayPolicy]) displayPolicy = termsDisplay;
  const excerpt = stricter(source.evidenceExcerptMaxChars, defaults.evidenceExcerptMaxChars);
  return {
    storeRawPayload: defaults.storeRawPayload && source.storeRawPayload,
    rawPayloadRetentionDays: stricter(source.rawPayloadRetentionDays, defaults.rawPayloadRetentionDays),
    descriptionRetentionDays: stricter(source.descriptionRetentionDays, defaults.descriptionRetentionDays),
    evidenceExcerptMaxChars: displayPolicy === 'SNIPPET_AND_LINK' ? excerpt : Math.min(excerpt, defaults.evidenceExcerptMaxChars),
    displayPolicy,
  };
}
