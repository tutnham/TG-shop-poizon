const RETRYABLE_UPSTREAM_PATTERN =
  /429|503|502|504|too many requests|service unavailable|service temporarily unavailable|forbidden resource|aborted|timeout|timed out|econnreset|etimedout|enotfound|eai_again|socket hang up|network|fetch failed/i;

/** Transient upstream failures (rate limit, overload, timeout). */
export function isRetryableUpstreamError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err);
  return RETRYABLE_UPSTREAM_PATTERN.test(message);
}
