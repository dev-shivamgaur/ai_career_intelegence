const on = (value?: string) => value === '1' || value === 'true';

/** Every Market Intelligence flag is off unless set. With all flags off the app behaves exactly as before. */
export const marketFlags = {
  pipeline: () => on(process.env.MARKET_PIPELINE_ENABLED),
  scheduler: () => on(process.env.MARKET_SCHEDULER_ENABLED),
  llmExtraction: () => on(process.env.MARKET_LLM_EXTRACTION),
  ui: () => on(process.env.MARKET_UI),
  skillGapField: () => on(process.env.MARKET_SKILL_GAP_FIELD),
  /** Set by worker.ts when WORKER_QUEUES lists "market". */
  worker: () => process.env.MARKET_WORKER === '1',
};
