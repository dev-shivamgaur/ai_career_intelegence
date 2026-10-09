/**
 * Code defaults for every IntelConfig key. A stored row overrides individual fields of its key.
 * Values marked "to calibrate" are starting points for the M6 vertical slice.
 */
export const INTEL_DEFAULTS = {
  retention: {
    storeRawPayload: false,
    rawPayloadRetentionDays: 30,
    descriptionRetentionDays: 180,
    evidenceExcerptMaxChars: 200,
  },
  fetch: {
    timeoutMs: 20_000,
    maxRetries: 3,
    requestsPerMinutePerHost: 30,
    circuitBreakerFailures: 5,
    robotsCacheHours: 24,
    staleAfterDays: 60,
    userAgent: 'AICareerIntelBot/1.0 (+https://example.invalid/bot; market-intel)',
  },
  extraction: {
    llmDailyLimit: 200,
    maxDescriptionChars: 12_000,
    llmOnlyConfidenceCap: 0.7,
    minSkillConfidence: 0.6,
  },
  dedupe: {
    windowDays: 45,
    jaccardThreshold: 0.8,
    shingleSize: 3,
  },
  resolver: {
    autoApprove: false,
    autoApproveMinJobs: 5,
    autoApproveMinCompanies: 3,
    embeddingMinSimilarity: 0.9,
    /** Ask the LLM to pick among the embedding shortlist when similarity is below the threshold. */
    llmSuggest: false,
    suggestShortlist: 5,
  },
  classification: {
    minConfidence: 0.6,
    titleWeight: 0.7,
    skillOverlapWeight: 0.3,
    llmFallback: false,
  },
  demand: {
    minClassificationConfidence: 0.6,
    minSkillConfidence: 0.6,
    companyCapShare: 0.2,
    activeStockWindowDays: 90,
    cacheTtlSeconds: 3600,
  },
  trend: {
    minPanelCompanies: 10,
    minTotalJobs: 50,
    minJobCount: 5,
    alpha: 0.05,
    confirmSteps: 2,
    emergingMaxBaseShare: 0.15,
    emergingMinRelativeGrowth: 0.5,
    emergingMinCompanies: 3,
  },
} as const;

type Widen<T> = T extends boolean ? boolean : T extends number ? number : T extends string ? string : { -readonly [K in keyof T]: Widen<T[K]> };

export type IntelConfigShape = Widen<typeof INTEL_DEFAULTS>;
export type IntelConfigKey = keyof IntelConfigShape;

export function isIntelConfigKey(key: string): key is IntelConfigKey {
  return Object.prototype.hasOwnProperty.call(INTEL_DEFAULTS, key);
}
