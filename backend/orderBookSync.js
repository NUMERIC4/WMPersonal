import { queueFetch } from "./queue.js";
import { getDb } from "./db.js";
import { analyzeOrdersByMarketKey, getMarketValue, groupOrdersByMarketKey, marketKeyForOrder, marketKeyId, median } from "./marketAnalysis.js";
import { classifyMarketFreshness } from "./marketFreshness.js";

const V2 = "https://api.warframe.market/v2";
const inFlightSyncs = new Map();

function optionalInteger(value, field, orderId) {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value)) throw new Error(`Invalid ${field} for order ${orderId}`);
  return value;
}

function optionalText(value) {
  return value === undefined || value === null ? null : String(value);
}

function normalizeOrder(raw, urlName, observedAt) {
  if (!raw || typeof raw !== "object") throw new Error("Malformed order payload");
  const orderId = optionalText(raw.id);
  if (!orderId) throw new Error("Order missing id");
  if (raw.type !== "buy" && raw.type !== "sell") throw new Error(`Invalid order type for order ${orderId}`);
  if (!Number.isInteger(raw.platinum)) throw new Error(`Invalid platinum for order ${orderId}`);

  const key = marketKeyForOrder(raw, urlName);
  return {
    order_id: orderId,
    market_key: marketKeyId(key),
    url_name: urlName,
    item_id: optionalText(raw.itemId),
    rank: optionalInteger(raw.rank, "rank", orderId),
    subtype: optionalText(raw.subtype),
    charges: optionalInteger(raw.charges, "charges", orderId),
    amber_stars: optionalInteger(raw.amberStars, "amberStars", orderId),
    cyan_stars: optionalInteger(raw.cyanStars, "cyanStars", orderId),
    order_type: raw.type,
    platinum: raw.platinum,
    quantity: optionalInteger(raw.quantity, "quantity", orderId),
    per_trade: raw.perTrade === undefined || raw.perTrade === null ? null : raw.perTrade ? 1 : 0,
    visible: raw.visible === undefined || raw.visible === null ? null : raw.visible ? 1 : 0,
    user_id: optionalText(raw.user?.id),
    user_slug: optionalText(raw.user?.slug ?? raw.user?.ingameName),
    user_status: optionalText(raw.user?.status),
    created_at: optionalText(raw.createdAt),
    updated_at: optionalText(raw.updatedAt),
    first_seen_at: observedAt,
    last_seen_at: observedAt,
    disappeared_at: null,
    is_active: 1,
  };
}

function normalizeApiResponse(json, urlName, observedAt) {
  const orders = Array.isArray(json?.data) ? json.data : null;
  if (!orders) throw new Error("Malformed order response: data must be an array");

  const seen = new Set();
  return orders.map(order => {
    const normalized = normalizeOrder(order, urlName, observedAt);
    if (seen.has(normalized.order_id)) throw new Error(`Duplicate order id in response: ${normalized.order_id}`);
    seen.add(normalized.order_id);
    return normalized;
  });
}

function dbRowToAnalysisOrder(row) {
  return {
    id: row.order_id,
    type: row.order_type,
    platinum: row.platinum,
    quantity: row.quantity,
    perTrade: row.per_trade === null ? null : !!row.per_trade,
    rank: row.rank,
    subtype: row.subtype,
    charges: row.charges,
    amberStars: row.amber_stars,
    cyanStars: row.cyan_stars,
    visible: row.visible === null ? null : !!row.visible,
    itemId: row.item_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    url_name: row.url_name,
    user: {
      id: row.user_id,
      slug: row.user_slug,
      status: row.user_status,
    },
  };
}

export function getStoredActiveOrders(urlName, options = {}) {
  const db = options.db ?? getDb();
  return db.prepare(
    "SELECT * FROM market_orders_current WHERE url_name = ? AND is_active = 1 ORDER BY market_key, platinum"
  ).all(urlName).map(dbRowToAnalysisOrder);
}

export function inFlightOrderBookSyncCount() {
  return inFlightSyncs.size;
}

export function buildStoredSummary(urlName, options = {}) {
  const orders = getStoredActiveOrders(urlName, options);
  const status = getOrderBookStatus(urlName, options);
  const configurations = analyzeOrdersByMarketKey(orders, urlName);
  return {
    url_name: urlName,
    freshness: status.freshnessDetails,
    storedActiveOrderCount: orders.length,
    configurationCount: configurations.length,
    configurations,
  };
}

function orderDebugRow(order) {
  return {
    id: order.id,
    type: order.type,
    price: order.platinum,
    quantity: order.quantity,
    rank: order.rank,
    subtype: order.subtype,
    charges: order.charges,
    amberStars: order.amberStars,
    cyanStars: order.cyanStars,
    status: order.user?.status ?? "unknown",
    user: order.user?.slug ?? "",
    updatedAt: order.updatedAt,
  };
}

function latestLegacySnapshot(db, urlName, marketKey) {
  if (marketKey.rank !== null && marketKey.rank !== undefined) {
    return db.prepare(
      "SELECT * FROM price_snapshots WHERE url_name = ? AND rank = ? ORDER BY fetched_at DESC LIMIT 1"
    ).get(urlName, marketKey.rank) ?? null;
  }
  return db.prepare(
    "SELECT * FROM price_snapshots WHERE url_name = ? ORDER BY fetched_at DESC LIMIT 1"
  ).get(urlName) ?? null;
}

function historicalSummary(db, urlName, marketKey) {
  const hasUnsupportedConfig = ["subtype", "charges", "amberStars", "cyanStars"]
    .some(field => marketKey[field] !== null && marketKey[field] !== undefined);
  if (hasUnsupportedConfig) {
    return {
      available: false,
      period: "48h",
      rows: 0,
      volume: 0,
      median: null,
      average: null,
      reason: "configuration_not_supported",
    };
  }

  const rank = marketKey.rank ?? null;
  const rows = rank !== null
    ? db.prepare(
      "SELECT * FROM item_statistics WHERE url_name = ? AND period = '48h' AND rank = ? ORDER BY datetime DESC LIMIT 24"
    ).all(urlName, rank)
    : db.prepare(
      "SELECT * FROM item_statistics WHERE url_name = ? AND period = '48h' ORDER BY datetime DESC LIMIT 24"
    ).all(urlName);

  const volume = rows.reduce((sum, row) => sum + (row.volume ?? 0), 0);
  const medians = rows.map(row => row.median).filter(value => value !== null && value !== undefined);
  const avgs = rows.map(row => row.avg_price).filter(value => value !== null && value !== undefined);
  return {
    available: volume > 0 && medians.length > 0,
    period: "48h",
    rows: rows.length,
    volume,
    median: medians.length ? Math.round(median(medians) * 100) / 100 : null,
    average: avgs.length ? Math.round((avgs.reduce((sum, value) => sum + value, 0) / avgs.length) * 100) / 100 : null,
    reason: volume > 0 && medians.length > 0 ? null : "no_recent_statistics",
  };
}

export function buildStoredAnalysis(urlName, options = {}) {
  const db = options.db ?? getDb();
  const orders = getStoredActiveOrders(urlName, { db });
  const status = getOrderBookStatus(urlName, options);
  const groups = groupOrdersByMarketKey(orders, urlName);
  const configurations = groups.map(group => {
    const historical = historicalSummary(db, urlName, group.key);
    const analysis = analyzeOrdersByMarketKey(group.orders, urlName, { freshness: status.freshnessDetails, historical })[0];
    const sells = group.orders
      .filter(order => order.type === "sell")
      .sort((a, b) => a.platinum - b.platinum)
      .map(orderDebugRow);
    const buys = group.orders
      .filter(order => order.type === "buy")
      .sort((a, b) => b.platinum - a.platinum)
      .map(orderDebugRow);

    return {
      ...analysis,
      legacySnapshot: latestLegacySnapshot(db, urlName, group.key),
      historical,
      selections: {
        acquire: getMarketValue(analysis.valuation, "acquire", { freshness: status.freshnessDetails, legacy: latestLegacySnapshot(db, urlName, group.key) }),
        fair: getMarketValue(analysis.valuation, "fair", { freshness: status.freshnessDetails, legacy: latestLegacySnapshot(db, urlName, group.key) }),
        resale: getMarketValue(analysis.valuation, "resale", { freshness: status.freshnessDetails, legacy: latestLegacySnapshot(db, urlName, group.key) }),
        liquidate: getMarketValue(analysis.valuation, "liquidate", { freshness: status.freshnessDetails }),
        historical: getMarketValue(analysis.valuation, "historical", { freshness: status.freshnessDetails }),
      },
      orders: { sells, buys },
    };
  });

  return {
    url_name: urlName,
    freshness: status.freshnessDetails,
    storedActiveOrderCount: orders.length,
    configurationCount: configurations.length,
    configurations,
  };
}

export function getStoredMarketCoverage(options = {}) {
  const db = options.db ?? getDb();
  const totalItems = db.prepare("SELECT COUNT(*) AS count FROM items").get()?.count ?? 0;
  const syncRows = db.prepare("SELECT * FROM market_order_sync_state").all();
  const freshnessCounts = { fresh: 0, aging: 0, stale: 0, never_synced: Math.max(0, totalItems - syncRows.length) };
  for (const row of syncRows) {
    const freshness = classifyMarketFreshness(row.last_successful_sync_at, options.freshness ?? {});
    freshnessCounts[freshness.state] = (freshnessCounts[freshness.state] ?? 0) + 1;
  }

  const activeRows = db.prepare(
    "SELECT url_name, market_key FROM market_orders_current WHERE is_active = 1 GROUP BY url_name, market_key"
  ).all();
  let usableCompetitiveConfigurations = 0;
  let historicalComparableConfigurations = 0;

  for (const row of activeRows) {
    const orders = db.prepare(
      "SELECT * FROM market_orders_current WHERE url_name = ? AND market_key = ? AND is_active = 1"
    ).all(row.url_name, row.market_key).map(dbRowToAnalysisOrder);
    const analysis = analyzeOrdersByMarketKey(orders, row.url_name)[0];
    if (analysis?.valuation?.competitiveEstimate !== null && analysis?.valuation?.competitiveEstimate !== undefined) {
      usableCompetitiveConfigurations++;
    }
    const key = analysis?.marketKey;
    if (key) {
      const historical = historicalSummary(db, row.url_name, key);
      if (historical.available) historicalComparableConfigurations++;
    }
  }

  return {
    totalItems,
    itemsWithStoredOrderBooks: syncRows.length,
    freshness: freshnessCounts,
    activeConfigurations: activeRows.length,
    usableCompetitiveConfigurations,
    historicalComparableConfigurations,
  };
}

export function getOrderBookStatus(urlName, options = {}) {
  const db = options.db ?? getDb();
  const row = db.prepare("SELECT * FROM market_order_sync_state WHERE url_name = ?").get(urlName);
  const freshness = classifyMarketFreshness(row?.last_successful_sync_at ?? null, options.freshness ?? {});

  return {
    url_name: urlName,
    synced: !!row?.last_successful_sync_at,
    lastSuccessfulSyncAt: row?.last_successful_sync_at ?? null,
    ageSeconds: freshness.ageSeconds,
    freshness: freshness.state,
    freshnessDetails: freshness,
    storedActiveOrderCount: row?.last_active_order_count ?? 0,
    configurationCount: row?.last_configuration_count ?? 0,
    lastFetchedOrderCount: row?.last_fetched_order_count ?? 0,
  };
}

export async function syncItemOrderBookFromOrders(urlName, rawOrders, options = {}) {
  if (!urlName) throw new Error("url_name required");

  const db = options.db ?? getDb();
  const observedAt = typeof options.now === "function"
    ? options.now()
    : options.now ?? new Date().toISOString();
  const orders = normalizeApiResponse({ data: rawOrders }, urlName, observedAt);

  const selectExisting = db.prepare("SELECT order_id, first_seen_at, is_active FROM market_orders_current WHERE order_id = ?");
  const insertOrder = db.prepare(
    "INSERT INTO market_orders_current (" +
    "order_id, market_key, url_name, item_id, rank, subtype, charges, amber_stars, cyan_stars, " +
    "order_type, platinum, quantity, per_trade, visible, user_id, user_slug, user_status, " +
    "created_at, updated_at, first_seen_at, last_seen_at, disappeared_at, is_active" +
    ") VALUES (" +
    "@order_id, @market_key, @url_name, @item_id, @rank, @subtype, @charges, @amber_stars, @cyan_stars, " +
    "@order_type, @platinum, @quantity, @per_trade, @visible, @user_id, @user_slug, @user_status, " +
    "@created_at, @updated_at, @first_seen_at, @last_seen_at, @disappeared_at, @is_active" +
    ")"
  );
  const updateOrder = db.prepare(
    "UPDATE market_orders_current SET " +
    "market_key=@market_key, url_name=@url_name, item_id=@item_id, rank=@rank, subtype=@subtype, charges=@charges, " +
    "amber_stars=@amber_stars, cyan_stars=@cyan_stars, order_type=@order_type, platinum=@platinum, " +
    "quantity=@quantity, per_trade=@per_trade, visible=@visible, user_id=@user_id, user_slug=@user_slug, " +
    "user_status=@user_status, created_at=@created_at, updated_at=@updated_at, last_seen_at=@last_seen_at, " +
    "disappeared_at=NULL, is_active=1 WHERE order_id=@order_id"
  );
  const activeForItem = db.prepare("SELECT order_id FROM market_orders_current WHERE url_name = ? AND is_active = 1").all(urlName);
  const markMissing = orders.length
    ? db.prepare(
      "UPDATE market_orders_current SET is_active = 0, disappeared_at = ? " +
      "WHERE url_name = ? AND is_active = 1 AND order_id NOT IN (" +
      orders.map(() => "?").join(",") +
      ")"
    )
    : null;
  const markAllMissing = db.prepare(
    "UPDATE market_orders_current SET is_active = 0, disappeared_at = ? WHERE url_name = ? AND is_active = 1"
  );
  const activeCountStmt = db.prepare(
    "SELECT COUNT(*) AS activeCount, COUNT(DISTINCT market_key) AS configurationCount " +
    "FROM market_orders_current WHERE url_name = ? AND is_active = 1"
  );
  const upsertSyncState = db.prepare(
    "INSERT INTO market_order_sync_state " +
    "(url_name, last_successful_sync_at, last_fetched_order_count, last_active_order_count, last_configuration_count) " +
    "VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT(url_name) DO UPDATE SET " +
    "last_successful_sync_at=excluded.last_successful_sync_at, " +
    "last_fetched_order_count=excluded.last_fetched_order_count, " +
    "last_active_order_count=excluded.last_active_order_count, " +
    "last_configuration_count=excluded.last_configuration_count"
  );

  const sync = {
    fetched: orders.length,
    inserted: 0,
    updated: 0,
    reactivated: 0,
    disappeared: 0,
    syncedAt: observedAt,
  };

  const tx = db.transaction(() => {
    for (const order of orders) {
      const existing = selectExisting.get(order.order_id);
      if (!existing) {
        insertOrder.run(order);
        sync.inserted++;
      } else {
        updateOrder.run({ ...order, first_seen_at: existing.first_seen_at });
        sync.updated++;
        if (!existing.is_active) sync.reactivated++;
      }
    }

    const observedIds = new Set(orders.map(order => order.order_id));
    sync.disappeared = activeForItem.filter(row => !observedIds.has(row.order_id)).length;
    if (sync.disappeared) {
      if (orders.length) {
        markMissing.run(observedAt, urlName, ...orders.map(order => order.order_id));
      } else {
        markAllMissing.run(observedAt, urlName);
      }
    }

    const counts = activeCountStmt.get(urlName);
    upsertSyncState.run(
      urlName,
      observedAt,
      orders.length,
      counts.activeCount,
      counts.configurationCount
    );
  });

  tx();

  const storedSummary = buildStoredSummary(urlName, { db });
  return {
    url_name: urlName,
    sync,
    ...storedSummary,
  };
}

async function runItemOrderBookSync(urlName, options = {}) {
  const fetchOrders = options.fetchOrders ?? ((slug) => (
    queueFetch(`${V2}/orders/item/${encodeURIComponent(slug)}`, { priority: options.priority ?? "normal" })
  ));

  const json = await fetchOrders(urlName);
  const rawOrders = Array.isArray(json?.data) ? json.data : null;
  if (!rawOrders) throw new Error("Malformed order response: data must be an array");
  return syncItemOrderBookFromOrders(urlName, rawOrders, options);
}

export async function syncItemOrderBook(urlName, options = {}) {
  if (!urlName) throw new Error("url_name required");
  const key = options.lockKey ?? urlName;
  if (options.useLock !== false && inFlightSyncs.has(key)) return inFlightSyncs.get(key);

  const promise = runItemOrderBookSync(urlName, options)
    .finally(() => {
      if (inFlightSyncs.get(key) === promise) inFlightSyncs.delete(key);
    });

  if (options.useLock !== false) inFlightSyncs.set(key, promise);
  return promise;
}
