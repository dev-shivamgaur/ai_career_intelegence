jest.mock('./market-fetch.service', () => ({ MarketFetchService: class {} }));
jest.mock('../retention/market-retention.service', () => ({ MarketRetentionService: class {} }));
jest.mock('../runs/market-run.service', () => ({ MarketRunService: class {} }));
jest.mock('../../redis/redis.service', () => ({ RedisService: class {} }));

import type { RawJobPayload } from '../connectors/source-connector';
import { descriptionExpired, retentionCutoffs } from '../retention/retention-policy';
import { MarketScheduler } from '../scheduler/market-scheduler';
import { marketSlotAt } from '../scheduler/ist-slot';
import { contentHash, planRawJobs, type ExistingRawJob } from './raw-job-diff';

const NOW = new Date('2026-10-09T00:30:00.000Z'); // 06:00 IST
const DAY = 24 * 60 * 60 * 1000;

function job(id: string, over: Partial<RawJobPayload> = {}): RawJobPayload {
  return {
    externalId: id,
    title: `Backend Engineer ${id}`,
    location: 'Remote',
    descriptionText: `Build APIs with Node.js and PostgreSQL. Job ${id}.`,
    url: `https://example.invalid/${id}`,
    postedAt: new Date(NOW.getTime() - 3 * DAY),
    sourceUpdatedAt: null,
    department: null,
    employmentType: null,
    workplaceType: null,
    raw: { id },
    ...over,
  };
}

function existingFrom(j: RawJobPayload, over: Partial<ExistingRawJob> = {}): ExistingRawJob {
  return {
    id: `row-${j.externalId}`,
    externalId: j.externalId,
    contentHash: contentHash(j),
    listingStatus: 'OPEN',
    sourcePostedAt: j.postedAt,
    firstSeenAt: new Date(NOW.getTime() - 3 * DAY),
    ...over,
  };
}

describe('contentHash', () => {
  it('ignores whitespace-only differences and volatile payload fields', () => {
    const a = job('1');
    const b = { ...job('1'), descriptionText: `  ${a.descriptionText.replace(/ /g, '   ')} `, raw: { id: '1', updated: 'x' } };
    expect(contentHash(a)).toBe(contentHash(b));
  });

  it('changes when the description changes', () => {
    expect(contentHash(job('1'))).not.toBe(contentHash(job('1', { descriptionText: 'Different text' })));
  });
});

describe('planRawJobs', () => {
  const opts = { now: NOW, staleAfterDays: 60 };

  it('a second run over an unchanged board produces 0 new and 0 changed', () => {
    const board = [job('1'), job('2'), job('3')];
    const first = planRawJobs([], board, opts);
    expect(first.create).toHaveLength(3);
    const second = planRawJobs(board.map((j) => existingFrom(j)), board, opts);
    expect(second.create).toHaveLength(0);
    expect(second.changed).toHaveLength(0);
    expect(second.unchangedIds).toHaveLength(3);
    expect(second.closeIds).toHaveLength(0);
  });

  it('flags jobs missing from the board as closed and detects changed content', () => {
    const existing = [existingFrom(job('1')), existingFrom(job('2')), existingFrom(job('3'))];
    const plan = planRawJobs(existing, [job('1'), job('2', { descriptionText: 'Now requires Go' })], opts);
    expect(plan.closeIds).toEqual(['row-3']);
    expect(plan.changed.map((c) => c.id)).toEqual(['row-2']);
    expect(plan.unchangedIds).toEqual(['row-1']);
  });

  it('does not close everything when a board suddenly returns nothing', () => {
    const existing = ['1', '2', '3', '4', '5'].map((id) => existingFrom(job(id)));
    const plan = planRawJobs(existing, [], opts);
    expect(plan.suspiciousEmpty).toBe(true);
    expect(plan.closeIds).toHaveLength(0);
  });

  it('marks jobs older than staleAfterDays as STALE and reopens re-listed closed jobs', () => {
    const old = job('old', { postedAt: new Date(NOW.getTime() - 90 * DAY) });
    const back = job('back');
    const plan = planRawJobs(
      [existingFrom(old), existingFrom(back, { listingStatus: 'CLOSED' })],
      [old, back, job('new-old', { postedAt: new Date(NOW.getTime() - 61 * DAY) })],
      opts,
    );
    expect(plan.staleIds).toEqual(['row-old']);
    expect(plan.reopenedIds).toEqual(['row-back']);
    expect(plan.create[0].stale).toBe(true);
  });

  it('ignores duplicate externalIds within one response', () => {
    const plan = planRawJobs([], [job('1'), job('1')], opts);
    expect(plan.create).toHaveLength(1);
  });
});

describe('retention policy', () => {
  const policy = {
    storeRawPayload: false,
    rawPayloadRetentionDays: 30,
    descriptionRetentionDays: 1,
    evidenceExcerptMaxChars: 200,
    displayPolicy: 'LINK_ONLY' as const,
  };

  it('a 1-day policy expires descriptions counted from closedAt, or lastSeenAt while open', () => {
    const cut = retentionCutoffs(policy, NOW);
    expect(descriptionExpired({ closedAt: new Date(NOW.getTime() - 2 * DAY), lastSeenAt: NOW }, cut)).toBe(true);
    expect(descriptionExpired({ closedAt: null, lastSeenAt: new Date(NOW.getTime() - 2 * DAY) }, cut)).toBe(true);
    expect(descriptionExpired({ closedAt: null, lastSeenAt: NOW }, cut)).toBe(false);
  });

  it('drops every stored payload when the policy forbids storing payloads', () => {
    expect(retentionCutoffs(policy, NOW).payloadBefore).toBeNull();
    expect(retentionCutoffs({ ...policy, storeRawPayload: true }, NOW).payloadBefore?.getTime()).toBe(NOW.getTime() - 30 * DAY);
  });
});

describe('market scheduler', () => {
  it('maps IST hours to slots with a daily window key', () => {
    expect(marketSlotAt(NOW)).toEqual({ slot: 'fetch', windowKey: '2026-10-09-fetch' });
    expect(marketSlotAt(new Date('2026-10-09T14:30:00.000Z'))).toEqual({ slot: 'aggregate', windowKey: '2026-10-09-aggregate' });
    expect(marketSlotAt(new Date('2026-10-08T20:30:00.000Z'))).toEqual({ slot: 'retention', windowKey: '2026-10-09-retention' });
    expect(marketSlotAt(new Date('2026-10-09T03:30:00.000Z'))).toBeNull();
  });

  function makeScheduler(opts: { lock: boolean; existingRun: boolean }) {
    const startFetchRun = jest.fn().mockResolvedValue({ runId: 'r1', taskCount: 2 });
    const redis = { setNx: jest.fn().mockResolvedValue(opts.lock), del: jest.fn().mockResolvedValue(undefined) };
    const runs = { findRunInWindow: jest.fn().mockResolvedValue(opts.existingRun ? { id: 'old' } : null) };
    const scheduler = new MarketScheduler(
      redis as never,
      runs as never,
      { startFetchRun } as never,
      { startRetentionRun: jest.fn() } as never,
    );
    return { scheduler, startFetchRun };
  }

  it('enqueues the fetch window once', async () => {
    const { scheduler, startFetchRun } = makeScheduler({ lock: true, existingRun: false });
    await scheduler.tick(NOW);
    expect(startFetchRun).toHaveBeenCalledWith('SCHEDULER', 'due', '2026-10-09-fetch');
  });

  it('skips when the Redis lock is held or a run already exists for the window', async () => {
    for (const opts of [
      { lock: false, existingRun: false },
      { lock: true, existingRun: true },
    ]) {
      const { scheduler, startFetchRun } = makeScheduler(opts);
      await scheduler.tick(NOW);
      expect(startFetchRun).not.toHaveBeenCalled();
    }
  });
});
