import { createHash } from 'crypto';
import type { RawJobPayload } from '../connectors/source-connector';

/** Hash of the fields that matter downstream. Volatile payload fields (timestamps, counters) are excluded on purpose. */
export function contentHash(job: Pick<RawJobPayload, 'title' | 'location' | 'descriptionText'>): string {
  const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
  return createHash('sha256')
    .update(`${norm(job.title)}\u0000${norm(job.location)}\u0000${norm(job.descriptionText)}`)
    .digest('hex');
}

export type ExistingRawJob = {
  id: string;
  externalId: string;
  contentHash: string;
  listingStatus: 'OPEN' | 'CLOSED' | 'STALE';
  sourcePostedAt: Date | null;
  firstSeenAt: Date;
};

export type RawJobPlan = {
  create: Array<{ job: RawJobPayload; hash: string; stale: boolean }>;
  changed: Array<{ id: string; job: RawJobPayload; hash: string }>;
  unchangedIds: string[];
  reopenedIds: string[];
  closeIds: string[];
  staleIds: string[];
  /** Board returned nothing while many jobs were open: likely an outage, so nothing is closed. */
  suspiciousEmpty: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure change detection for one source fetch.
 * New externalId -> create; same id with a different hash -> changed (reprocess); same hash -> touch lastSeenAt only.
 * Open jobs missing from the board are closed. Jobs still listed but older than staleAfterDays are STALE.
 */
export function planRawJobs(
  existing: ExistingRawJob[],
  fetched: RawJobPayload[],
  opts: { now: Date; staleAfterDays: number; minOpenForEmptyGuard?: number },
): RawJobPlan {
  const byExternal = new Map(existing.map((e) => [e.externalId, e]));
  const seen = new Set<string>();
  const plan: RawJobPlan = {
    create: [],
    changed: [],
    unchangedIds: [],
    reopenedIds: [],
    closeIds: [],
    staleIds: [],
    suspiciousEmpty: false,
  };
  const staleBefore = opts.now.getTime() - opts.staleAfterDays * DAY_MS;

  for (const job of fetched) {
    if (seen.has(job.externalId)) continue;
    seen.add(job.externalId);
    const hash = contentHash(job);
    const prev = byExternal.get(job.externalId);
    if (!prev) {
      plan.create.push({ job, hash, stale: job.postedAt !== null && job.postedAt.getTime() < staleBefore });
      continue;
    }
    if (prev.contentHash !== hash) plan.changed.push({ id: prev.id, job, hash });
    else plan.unchangedIds.push(prev.id);
    const age = (job.postedAt ?? prev.sourcePostedAt ?? prev.firstSeenAt).getTime();
    if (age < staleBefore) {
      if (prev.listingStatus !== 'STALE') plan.staleIds.push(prev.id);
    } else if (prev.listingStatus !== 'OPEN') {
      plan.reopenedIds.push(prev.id);
    }
  }

  const openMissing = existing.filter((e) => e.listingStatus !== 'CLOSED' && !seen.has(e.externalId));
  const openCount = existing.filter((e) => e.listingStatus !== 'CLOSED').length;
  if (fetched.length === 0 && openCount >= (opts.minOpenForEmptyGuard ?? 5)) {
    plan.suspiciousEmpty = true;
  } else {
    plan.closeIds = openMissing.map((e) => e.id);
  }
  return plan;
}
