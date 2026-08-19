const DEFAULT_FRESH_SECONDS = 5 * 60;
const DEFAULT_AGING_SECONDS = 30 * 60;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function marketFreshnessThresholds(options = {}) {
  const freshSeconds = positiveInteger(
    options.freshSeconds ?? process.env.WMP_MARKET_FRESH_SECONDS,
    DEFAULT_FRESH_SECONDS
  );
  const agingSeconds = Math.max(
    freshSeconds,
    positiveInteger(options.agingSeconds ?? process.env.WMP_MARKET_AGING_SECONDS, DEFAULT_AGING_SECONDS)
  );
  return { freshSeconds, agingSeconds };
}

export function classifyMarketFreshness(lastSuccessfulSyncAt, options = {}) {
  if (!lastSuccessfulSyncAt) {
    return {
      state: "never_synced",
      lastSuccessfulSyncAt: null,
      ageSeconds: null,
      thresholds: marketFreshnessThresholds(options),
    };
  }

  const nowMs = options.now instanceof Date
    ? options.now.getTime()
    : options.now
      ? new Date(options.now).getTime()
      : Date.now();
  const syncedMs = new Date(lastSuccessfulSyncAt).getTime();

  if (!Number.isFinite(nowMs) || !Number.isFinite(syncedMs)) {
    return {
      state: "never_synced",
      lastSuccessfulSyncAt,
      ageSeconds: null,
      thresholds: marketFreshnessThresholds(options),
    };
  }

  const thresholds = marketFreshnessThresholds(options);
  const ageSeconds = Math.max(0, Math.floor((nowMs - syncedMs) / 1000));
  const state = ageSeconds < thresholds.freshSeconds
    ? "fresh"
    : ageSeconds <= thresholds.agingSeconds
      ? "aging"
      : "stale";

  return {
    state,
    lastSuccessfulSyncAt,
    ageSeconds,
    thresholds,
  };
}
