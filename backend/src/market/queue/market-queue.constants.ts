export const MARKET_EXCHANGE = 'market.pipeline';
export const MARKET_DLX = 'market.pipeline.dlx';
export const MARKET_RETRY_EXCHANGE = 'market.retry';
export const MARKET_RETRY_QUEUE = 'market.retry';

export const MARKET_QUEUES = {
  fetch: 'market.fetch',
  process: 'market.process',
  aggregate: 'market.aggregate',
  retention: 'market.retention',
} as const;

export type MarketQueueName = (typeof MARKET_QUEUES)[keyof typeof MARKET_QUEUES];
export const ALL_MARKET_QUEUES = Object.values(MARKET_QUEUES) as MarketQueueName[];
export const dlqName = (queue: MarketQueueName) => `${queue}.dlq`;

export const MARKET_MAX_ATTEMPTS = 3;
/** Delay before attempt 2 and attempt 3. Per-message TTL on one retry queue, so keep delays short and similar. */
export const MARKET_RETRY_DELAYS_MS = [5_000, 30_000];

export type MarketMessage = {
  taskId: string;
  runId: string;
  queue: MarketQueueName;
  attempt: number;
  payload: Record<string, unknown>;
};
