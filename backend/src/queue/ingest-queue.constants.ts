export const INGEST_EXCHANGE = 'career.ingest';
export const INGEST_QUEUE = 'career.ingest';
export const INGEST_DLX = 'career.ingest.dlx';
export const INGEST_DLQ = 'career.ingest.dlq';
export const INGEST_ROUTING = 'career.ingest';

export const INGEST_MAX_ATTEMPTS = 3;

export type IngestTriggerName = 'SCHEDULER' | 'ADMIN' | 'CREATE';

export type IngestQueueMessage = {
  runId: string;
  jobId: string;
  careerId: string;
  trigger: IngestTriggerName;
  attempt: number;
};
