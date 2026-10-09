import type { EffectiveRetention } from '../sources/compliance';

const DAY_MS = 24 * 60 * 60 * 1000;

export type RetentionCutoffs = {
  /** Descriptions of jobs whose closedAt (or lastSeenAt while open) is before this are purged. */
  descriptionBefore: Date;
  /** Raw payloads stored before this are dropped. Null means drop every stored payload (policy forbids storing). */
  payloadBefore: Date | null;
};

export function retentionCutoffs(policy: EffectiveRetention, now: Date): RetentionCutoffs {
  return {
    descriptionBefore: new Date(now.getTime() - policy.descriptionRetentionDays * DAY_MS),
    payloadBefore: policy.storeRawPayload ? new Date(now.getTime() - policy.rawPayloadRetentionDays * DAY_MS) : null,
  };
}

/** Whether one row's description is past retention. Mirrors the SQL used by the purge. */
export function descriptionExpired(
  row: { closedAt: Date | null; lastSeenAt: Date },
  cutoffs: RetentionCutoffs,
): boolean {
  return (row.closedAt ?? row.lastSeenAt).getTime() < cutoffs.descriptionBefore.getTime();
}
