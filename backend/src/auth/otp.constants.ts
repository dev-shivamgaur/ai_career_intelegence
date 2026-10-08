/** Redis-backed OTP policy. Defaults match product rules; env can override. */
export const OTP_DEFAULTS = {
  /** OTP hash TTL in Redis — auto-deleted after this. */
  ttlSeconds: 300,
  /** Minimum gap between two sends. */
  resendCooldownSeconds: 60,
  /** Rolling/fixed window for send count (from first send). */
  rateLimitWindowSeconds: 600,
  /** Max OTPs a phone may request inside the window. */
  rateLimitMax: 3,
  /** Max verify attempts against one OTP; then the OTP is deleted. */
  verifyMaxAttempts: 3,
} as const;
