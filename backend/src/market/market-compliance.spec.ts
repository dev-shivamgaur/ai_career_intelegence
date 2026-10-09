import { effectiveRetention, fetchBlocker, termsReviewProblem } from './sources/compliance';
import { isPathAllowed, parseRobots } from './http/robots';
import { htmlToText } from './http/html-to-text';

const now = new Date('2026-10-09T00:00:00Z');
const future = new Date('2027-01-01T00:00:00Z');
const past = new Date('2026-10-01T00:00:00Z');
const reviewed = { termsReviewedAt: past, termsReviewDueAt: future, allowedUses: ['ANALYTICS_AGGREGATE'] };

describe('termsReviewProblem', () => {
  it('requires a recorded, unexpired review that allows analytics', () => {
    expect(termsReviewProblem({ ...reviewed, termsReviewedAt: null }, now)).toBe('TERMS_NOT_REVIEWED');
    expect(termsReviewProblem({ ...reviewed, termsReviewDueAt: null }, now)).toBe('TERMS_REVIEW_DUE_DATE_MISSING');
    expect(termsReviewProblem({ ...reviewed, termsReviewDueAt: past }, now)).toBe('TERMS_REVIEW_EXPIRED');
    expect(termsReviewProblem({ ...reviewed, allowedUses: ['DISPLAY_LINK_ONLY'] }, now)).toBe('ANALYTICS_USE_NOT_ALLOWED');
    expect(termsReviewProblem(reviewed, now)).toBeNull();
  });
});

describe('fetchBlocker', () => {
  it('blocks disabled, paused and inactive-company sources', () => {
    const base = { ...reviewed, enabled: true, pausedReason: null, company: { active: true } };
    expect(fetchBlocker(base, now)).toBeNull();
    expect(fetchBlocker({ ...base, enabled: false }, now)).toBe('SOURCE_DISABLED');
    expect(fetchBlocker({ ...base, pausedReason: 'CIRCUIT_BREAKER' }, now)).toBe('PAUSED: CIRCUIT_BREAKER');
    expect(fetchBlocker({ ...base, company: { active: false } }, now)).toBe('COMPANY_INACTIVE');
    expect(fetchBlocker({ ...base, termsReviewedAt: null }, now)).toBe('TERMS_NOT_REVIEWED');
  });
});

describe('effectiveRetention', () => {
  const defaults = { storeRawPayload: false, rawPayloadRetentionDays: 30, descriptionRetentionDays: 180, evidenceExcerptMaxChars: 200 };
  const source = {
    storeRawPayload: true,
    rawPayloadRetentionDays: null,
    descriptionRetentionDays: 400,
    evidenceExcerptMaxChars: 50,
    displayPolicy: 'SNIPPET_AND_LINK' as const,
    allowedUses: ['ANALYTICS_AGGREGATE', 'DISPLAY_SNIPPET'],
  };

  it('can only be stricter than the global defaults', () => {
    expect(effectiveRetention(source, defaults)).toEqual({
      storeRawPayload: false,
      rawPayloadRetentionDays: 30,
      descriptionRetentionDays: 180,
      evidenceExcerptMaxChars: 50,
      displayPolicy: 'SNIPPET_AND_LINK',
    });
    expect(effectiveRetention({ ...source, descriptionRetentionDays: 1 }, defaults).descriptionRetentionDays).toBe(1);
  });

  it('caps display policy by the terms review', () => {
    expect(effectiveRetention({ ...source, allowedUses: ['ANALYTICS_AGGREGATE', 'DISPLAY_LINK_ONLY'] }, defaults).displayPolicy).toBe('LINK_ONLY');
    expect(effectiveRetention({ ...source, allowedUses: ['ANALYTICS_AGGREGATE'] }, defaults).displayPolicy).toBe('NONE');
  });
});

describe('robots.txt', () => {
  const groups = parseRobots(`
User-agent: *
Disallow: /private
Allow: /private/public$

User-agent: AICareerIntelBot
Disallow: /v1/boards/secret
`);

  it('applies the group that names our token over "*"', () => {
    expect(isPathAllowed(groups, 'AICareerIntelBot', '/v1/boards/secret/jobs')).toBe(false);
    expect(isPathAllowed(groups, 'AICareerIntelBot', '/private')).toBe(true);
  });

  it('uses longest match with Allow winning ties', () => {
    expect(isPathAllowed(groups, 'OtherBot', '/private/x')).toBe(false);
    expect(isPathAllowed(groups, 'OtherBot', '/private/public')).toBe(true);
    expect(isPathAllowed(groups, 'OtherBot', '/v1/boards/acme/jobs')).toBe(true);
  });

  it('treats an empty Disallow as allow-all and supports wildcards', () => {
    expect(isPathAllowed(parseRobots('User-agent: *\nDisallow:'), 'x', '/anything')).toBe(true);
    expect(isPathAllowed(parseRobots('User-agent: *\nDisallow: /*.json$'), 'x', '/jobs.json')).toBe(false);
    expect(isPathAllowed(parseRobots('User-agent: *\nDisallow: /'), 'x', '/jobs')).toBe(false);
  });
});

describe('htmlToText', () => {
  it('keeps list structure and decodes entities', () => {
    expect(htmlToText('<h3>Requirements</h3><ul><li>Go &amp; Rust</li><li>SQL</li></ul><script>x()</script>')).toBe(
      'Requirements\n- Go & Rust\n- SQL',
    );
  });
});
