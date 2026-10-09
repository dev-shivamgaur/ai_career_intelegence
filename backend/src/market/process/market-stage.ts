import type { MarketProcessingStatus, MarketRawJob, MarketSource } from '../../prisma/client';

export type StageRow = MarketRawJob & { source: Pick<MarketSource, 'id' | 'companyId'> };

/** Shared per-batch state (config snapshots, budgets) so stages do not reload config for every row. */
export type StageContext = { now: Date; cache: Map<string, unknown> };

/**
 * One pipeline checkpoint. A row at `from` is moved to `to` after `run` succeeds.
 * Stages register themselves; a row waits at a checkpoint until the next stage exists.
 */
export interface MarketStage {
  readonly name: string;
  readonly from: MarketProcessingStatus;
  readonly to: MarketProcessingStatus;
  run(row: StageRow, ctx: StageContext): Promise<void>;
}
