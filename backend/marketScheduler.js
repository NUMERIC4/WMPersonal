import { getDb } from "./db.js";
import { syncItemOrderBook } from "./orderBookSync.js";

const SOURCE_WEIGHTS = {
  manual_refresh: 10,
  market_view: 8,
  scanner: 5,
  profit: 5,
  favourite: 3,
};

const DEFAULTS = {
  enabled: process.env.WMP_MARKET_SCHEDULER_ENABLED === "true",
  intervalMs: numberEnv("WMP_MARKET_SCHEDULER_INTERVAL_MS", 15000),
  batchSize: numberEnv("WMP_MARKET_SCHEDULER_BATCH_SIZE", 1),
  maxCandidates: numberEnv("WMP_MARKET_SCHEDULER_MAX_CANDIDATES", 10),
  demandThrottleMs: numberEnv("WMP_MARKET_DEMAND_THROTTLE_MS", 60000),
  activeMinRefreshMs: numberEnv("WMP_MARKET_ACTIVE_MIN_REFRESH_MS", 3 * 60 * 1000),
  recentMinRefreshMs: numberEnv("WMP_MARKET_RECENT_MIN_REFRESH_MS", 15 * 60 * 1000),
  backgroundMinRefreshMs: numberEnv("WMP_MARKET_BACKGROUND_MIN_REFRESH_MS", 60 * 60 * 1000),
  demandHalfLifeMs: numberEnv("WMP_MARKET_DEMAND_HALF_LIFE_MS", 60 * 60 * 1000),
  demandMaxAgeMs: numberEnv("WMP_MARKET_DEMAND_MAX_AGE_MS", 24 * 60 * 60 * 1000),
  cleanupLimit: numberEnv("WMP_MARKET_DEMAND_CLEANUP_LIMIT", 200),
};

let timer = null;
let tickRunning = false;
let started = false;
let lastTickAt = null;
let lastSuccessfulRefreshAt = null;
let refreshTimes = [];
let lastError = null;

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function iso(value = new Date()) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function ageMs(nowMs, timestamp) {
  if (!timestamp) return Infinity;
  const then = new Date(timestamp).getTime();
  return Number.isFinite(then) ? Math.max(0, nowMs - then) : Infinity;
}

function minRefreshMsFor(source, options = DEFAULTS) {
  if (source === "manual_refresh" || source === "market_view") return options.activeMinRefreshMs;
  if (source === "scanner" || source === "profit") return options.recentMinRefreshMs;
  return options.backgroundMinRefreshMs;
}

function backoffDelayMs(failureCount) {
  if (!failureCount) return 0;
  return Math.min(60 * 60 * 1000, 5 * 60 * 1000 * 2 ** Math.max(0, failureCount - 1));
}

export function calculateSchedulerPriority(candidate, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const nowMs = options.nowMs ?? Date.now();
  const demandAge = ageMs(nowMs, candidate.last_requested_at);
  const syncAge = ageMs(nowMs, candidate.last_successful_sync_at);

  if (demandAge > config.demandMaxAgeMs) return { eligible: false, score: 0, reason: "demand_expired" };
  if (candidate.next_retry_at && ageMs(nowMs, candidate.next_retry_at) === 0) {
    return { eligible: false, score: 0, reason: "backoff" };
  }

  const minRefresh = minRefreshMsFor(candidate.source, config);
  if (candidate.last_successful_sync_at && syncAge < minRefresh) {
    return { eligible: false, score: 0, reason: "min_refresh_interval" };
  }

  const demandWeight = candidate.weight ?? SOURCE_WEIGHTS[candidate.source] ?? 1;
  const recencyMultiplier = Math.pow(0.5, demandAge / config.demandHalfLifeMs);
  const freshnessNeed = !candidate.last_successful_sync_at
    ? 4
    : syncAge > config.backgroundMinRefreshMs
      ? 3
      : syncAge > config.recentMinRefreshMs
        ? 2
        : 1;
  const failurePenalty = 1 / (1 + (candidate.failure_count ?? 0));

  return {
    eligible: true,
    score: demandWeight * recencyMultiplier * freshnessNeed * failurePenalty,
    reason: candidate.source,
    demandAgeMs: demandAge,
    syncAgeMs: syncAge,
  };
}

export function recordMarketDemand(urlName, source, options = {}) {
  if (!urlName || !source) return { recorded: false, reason: "missing_input" };
  const db = options.db ?? getDb();
  const now = options.now ?? iso();
  const throttleMs = options.throttleMs ?? DEFAULTS.demandThrottleMs;
  const weight = options.weight ?? SOURCE_WEIGHTS[source] ?? 1;
  const existing = db.prepare(
    "SELECT last_requested_at FROM market_order_demand WHERE url_name = ? AND source = ?"
  ).get(urlName, source);

  if (existing && ageMs(new Date(now).getTime(), existing.last_requested_at) < throttleMs) {
    return { recorded: false, reason: "throttled" };
  }

  db.prepare(
    "INSERT INTO market_order_demand (url_name, source, last_requested_at, weight) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(url_name, source) DO UPDATE SET last_requested_at=excluded.last_requested_at, weight=excluded.weight"
  ).run(urlName, source, now, weight);
  return { recorded: true, url_name: urlName, source, last_requested_at: now, weight };
}

export function recordMarketDemands(urlNames, source, options = {}) {
  const db = options.db ?? getDb();
  const tx = db.transaction((slugs) => slugs.map(slug => recordMarketDemand(slug, source, { ...options, db })));
  return tx([...new Set((urlNames ?? []).filter(Boolean))]);
}

export function getSchedulerCandidates(options = {}) {
  const db = options.db ?? getDb();
  const limit = options.limit ?? DEFAULTS.maxCandidates;
  const nowMs = options.nowMs ?? Date.now();
  const rows = db.prepare(
    "SELECT d.url_name, d.source, d.last_requested_at, d.weight, " +
    "s.last_successful_sync_at, s.last_active_order_count, s.last_configuration_count, " +
    "bs.failure_count, bs.next_retry_at " +
    "FROM market_order_demand d " +
    "LEFT JOIN market_order_sync_state s ON s.url_name = d.url_name " +
    "LEFT JOIN market_order_scheduler_state bs ON bs.url_name = d.url_name " +
    "UNION ALL " +
    "SELECT f.url_name, 'favourite' AS source, MAX(f.added_at) AS last_requested_at, ? AS weight, " +
    "s.last_successful_sync_at, s.last_active_order_count, s.last_configuration_count, " +
    "bs.failure_count, bs.next_retry_at " +
    "FROM favourite_user_marketplace_items f " +
    "LEFT JOIN market_order_sync_state s ON s.url_name = f.url_name " +
    "LEFT JOIN market_order_scheduler_state bs ON bs.url_name = f.url_name " +
    "GROUP BY f.url_name"
  ).all(SOURCE_WEIGHTS.favourite);

  return rows
    .map(row => ({ ...row, priority: calculateSchedulerPriority(row, { ...options, nowMs }) }))
    .filter(row => row.priority.eligible)
    .sort((a, b) => b.priority.score - a.priority.score)
    .slice(0, limit);
}

export function cleanupOldMarketDemand(options = {}) {
  const db = options.db ?? getDb();
  const maxAgeMs = options.demandMaxAgeMs ?? DEFAULTS.demandMaxAgeMs;
  const limit = options.limit ?? DEFAULTS.cleanupLimit;
  const nowMs = options.nowMs ?? Date.now();
  const cutoff = new Date(nowMs - maxAgeMs).toISOString();
  const rows = db.prepare(
    "SELECT url_name, source FROM market_order_demand WHERE last_requested_at < ? LIMIT ?"
  ).all(cutoff, limit);
  const remove = db.prepare("DELETE FROM market_order_demand WHERE url_name = ? AND source = ?");
  const tx = db.transaction((items) => {
    for (const item of items) remove.run(item.url_name, item.source);
  });
  tx(rows);
  return { deleted: rows.length, cutoff };
}

export function getSchedulerDebugRows(options = {}) {
  const db = options.db ?? getDb();
  const nowMs = options.nowMs ?? Date.now();
  const rows = db.prepare(
    "SELECT d.url_name, d.source, d.last_requested_at, d.weight, " +
    "s.last_successful_sync_at, s.last_active_order_count, s.last_configuration_count, " +
    "bs.failure_count, bs.next_retry_at " +
    "FROM market_order_demand d " +
    "LEFT JOIN market_order_sync_state s ON s.url_name = d.url_name " +
    "LEFT JOIN market_order_scheduler_state bs ON bs.url_name = d.url_name " +
    "ORDER BY d.last_requested_at DESC LIMIT ?"
  ).all(options.limit ?? 100);

  return rows.map(row => {
    const priority = calculateSchedulerPriority(row, { ...options, nowMs });
    return {
      url_name: row.url_name,
      source: row.source,
      lastRequestedAt: row.last_requested_at,
      lastSuccessfulSyncAt: row.last_successful_sync_at,
      activeOrderCount: row.last_active_order_count ?? 0,
      configurationCount: row.last_configuration_count ?? 0,
      failureCount: row.failure_count ?? 0,
      nextRetryAt: row.next_retry_at ?? null,
      eligible: priority.eligible,
      ineligibleReason: priority.eligible ? null : priority.reason,
      score: Math.round(priority.score * 100) / 100,
    };
  });
}

function markSchedulerSuccess(db, urlName, at) {
  db.prepare(
    "INSERT INTO market_order_scheduler_state (url_name, failure_count, last_success_at, next_retry_at, last_failure_at) " +
    "VALUES (?, 0, ?, NULL, NULL) " +
    "ON CONFLICT(url_name) DO UPDATE SET failure_count=0, last_success_at=excluded.last_success_at, next_retry_at=NULL, last_failure_at=NULL"
  ).run(urlName, at);
}

function markSchedulerFailure(db, urlName, at) {
  const row = db.prepare("SELECT failure_count FROM market_order_scheduler_state WHERE url_name = ?").get(urlName);
  const failureCount = (row?.failure_count ?? 0) + 1;
  const nextRetry = new Date(new Date(at).getTime() + backoffDelayMs(failureCount)).toISOString();
  db.prepare(
    "INSERT INTO market_order_scheduler_state (url_name, failure_count, last_failure_at, next_retry_at) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(url_name) DO UPDATE SET failure_count=excluded.failure_count, last_failure_at=excluded.last_failure_at, next_retry_at=excluded.next_retry_at"
  ).run(urlName, failureCount, at, nextRetry);
}

export async function runMarketSchedulerTick(options = {}) {
  if (tickRunning) return { skipped: true, reason: "already_running" };
  tickRunning = true;
  const db = options.db ?? getDb();
  const config = { ...DEFAULTS, ...options };
  const now = options.now ?? iso();
  lastTickAt = now;

  try {
    cleanupOldMarketDemand({ db, nowMs: new Date(now).getTime(), demandMaxAgeMs: config.demandMaxAgeMs });
    const candidates = getSchedulerCandidates({ ...config, db, nowMs: new Date(now).getTime() });
    const selected = candidates.slice(0, config.batchSize);
    const results = [];
    const syncFn = options.syncFn ?? syncItemOrderBook;

    for (const candidate of selected) {
      try {
        const result = await syncFn(candidate.url_name, { priority: "low" });
        const successAt = result.sync?.syncedAt ?? iso();
        markSchedulerSuccess(db, candidate.url_name, successAt);
        lastSuccessfulRefreshAt = successAt;
        refreshTimes.push(new Date(successAt).getTime());
        results.push({ url_name: candidate.url_name, ok: true, sync: result.sync });
      } catch (error) {
        markSchedulerFailure(db, candidate.url_name, iso());
        results.push({ url_name: candidate.url_name, ok: false, error: error.message });
      }
    }

    lastError = null;
    return { selected: selected.length, results };
  } catch (error) {
    lastError = error.message;
    return { error: error.message };
  } finally {
    tickRunning = false;
  }
}

export function startMarketOrderScheduler(options = {}) {
  const config = { ...DEFAULTS, ...options };
  if (!config.enabled || started) return { started: false, enabled: config.enabled };
  started = true;
  timer = setInterval(() => { runMarketSchedulerTick(config).catch(() => {}); }, config.intervalMs);
  return { started: true, enabled: true, intervalMs: config.intervalMs };
}

export function stopMarketOrderScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

export function getMarketSchedulerStatus(options = {}) {
  const db = options.db ?? getDb();
  const nowMs = Date.now();
  refreshTimes = refreshTimes.filter(time => nowMs - time <= 60 * 60 * 1000);
  const nextCandidates = getSchedulerCandidates({ db, limit: 5 });
  return {
    enabled: DEFAULTS.enabled,
    running: started,
    tickRunning,
    lastTickAt,
    lastSuccessfulRefreshAt,
    refreshesLastHour: refreshTimes.length,
    eligibleItems: getSchedulerCandidates({ db, limit: 1000 }).length,
    nextCandidates: nextCandidates.map(row => ({
      url_name: row.url_name,
      reason: row.source,
      score: Math.round(row.priority.score * 100) / 100,
    })),
    lastError,
    config: {
      intervalMs: DEFAULTS.intervalMs,
      batchSize: DEFAULTS.batchSize,
    },
  };
}
