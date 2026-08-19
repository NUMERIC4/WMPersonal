import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initDb, getDb } from "../backend/db.js";
import { buildStoredAnalysis, buildStoredSummary, getOrderBookStatus, getStoredMarketCoverage, syncItemOrderBook } from "../backend/orderBookSync.js";
import { classifyMarketFreshness } from "../backend/marketFreshness.js";
import { marketKeyForOrder, marketKeyId } from "../backend/marketAnalysis.js";

function withTestDb(fn) {
  return async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wmpersonal-orders-"));
    initDb({ path: path.join(tempDir, "data.db") });
    const db = getDb();
    try {
      await fn(db);
    } finally {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

function order(id, overrides = {}) {
  return {
    id,
    type: "sell",
    platinum: 20,
    quantity: 1,
    perTrade: true,
    visible: true,
    itemId: "item-1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    user: { id: `user-${id}`, slug: `user-${id}`, status: "ingame" },
    ...overrides,
  };
}

function rows(db) {
  return db.prepare("SELECT * FROM market_orders_current ORDER BY order_id").all();
}

test("initial sync inserts active observed orders", withTestDb(async (db) => {
  const response = { data: [order("A"), order("B"), order("C")] };
  const result = await syncItemOrderBook("test_item", {
    db,
    now: "2026-08-19T10:00:00.000Z",
    fetchOrders: async () => response,
  });

  assert.deepEqual(result.sync, {
    fetched: 3,
    inserted: 3,
    updated: 0,
    reactivated: 0,
    disappeared: 0,
    syncedAt: "2026-08-19T10:00:00.000Z",
  });
  assert.equal(rows(db).length, 3);
  const state = db.prepare("SELECT * FROM market_order_sync_state WHERE url_name = ?").get("test_item");
  assert.equal(state.last_successful_sync_at, "2026-08-19T10:00:00.000Z");
  assert.equal(state.last_fetched_order_count, 3);
  assert.equal(state.last_active_order_count, 3);
  assert.equal(state.last_configuration_count, 1);
  for (const row of rows(db)) {
    assert.equal(row.is_active, 1);
    assert.equal(row.first_seen_at, "2026-08-19T10:00:00.000Z");
    assert.equal(row.last_seen_at, "2026-08-19T10:00:00.000Z");
  }
}));

test("second unchanged sync preserves first_seen_at and updates last_seen_at", withTestDb(async (db) => {
  const response = { data: [order("A"), order("B"), order("C")] };
  await syncItemOrderBook("test_item", { db, now: "2026-08-19T10:00:00.000Z", fetchOrders: async () => response });
  await syncItemOrderBook("test_item", { db, now: "2026-08-19T11:00:00.000Z", fetchOrders: async () => response });

  assert.equal(rows(db).length, 3);
  for (const row of rows(db)) {
    assert.equal(row.first_seen_at, "2026-08-19T10:00:00.000Z");
    assert.equal(row.last_seen_at, "2026-08-19T11:00:00.000Z");
  }
}));

test("changed order updates current mutable fields without history", withTestDb(async (db) => {
  await syncItemOrderBook("test_item", {
    db,
    now: "2026-08-19T10:00:00.000Z",
    fetchOrders: async () => ({ data: [order("A", { platinum: 20 })] }),
  });
  await syncItemOrderBook("test_item", {
    db,
    now: "2026-08-19T11:00:00.000Z",
    fetchOrders: async () => ({ data: [order("A", { platinum: 25, quantity: 4, user: { id: "user-A", slug: "user-A", status: "online" } })] }),
  });

  const row = rows(db)[0];
  assert.equal(row.platinum, 25);
  assert.equal(row.quantity, 4);
  assert.equal(row.user_status, "online");
  assert.equal(row.first_seen_at, "2026-08-19T10:00:00.000Z");
}));

test("successful sync marks missing active orders disappeared", withTestDb(async (db) => {
  await syncItemOrderBook("test_item", {
    db,
    now: "2026-08-19T10:00:00.000Z",
    fetchOrders: async () => ({ data: [order("A"), order("B"), order("C")] }),
  });
  const result = await syncItemOrderBook("test_item", {
    db,
    now: "2026-08-19T11:00:00.000Z",
    fetchOrders: async () => ({ data: [order("A"), order("C")] }),
  });

  const b = db.prepare("SELECT * FROM market_orders_current WHERE order_id = ?").get("B");
  assert.equal(result.sync.disappeared, 1);
  assert.equal(b.is_active, 0);
  assert.equal(b.disappeared_at, "2026-08-19T11:00:00.000Z");
}));

test("reactivation preserves original first_seen_at", withTestDb(async (db) => {
  await syncItemOrderBook("test_item", {
    db,
    now: "2026-08-19T10:00:00.000Z",
    fetchOrders: async () => ({ data: [order("A"), order("B"), order("C")] }),
  });
  await syncItemOrderBook("test_item", {
    db,
    now: "2026-08-19T11:00:00.000Z",
    fetchOrders: async () => ({ data: [order("A"), order("C")] }),
  });
  const result = await syncItemOrderBook("test_item", {
    db,
    now: "2026-08-19T12:00:00.000Z",
    fetchOrders: async () => ({ data: [order("A"), order("B"), order("C")] }),
  });

  const b = db.prepare("SELECT * FROM market_orders_current WHERE order_id = ?").get("B");
  assert.equal(result.sync.reactivated, 1);
  assert.equal(b.is_active, 1);
  assert.equal(b.first_seen_at, "2026-08-19T10:00:00.000Z");
  assert.equal(b.last_seen_at, "2026-08-19T12:00:00.000Z");
  assert.equal(b.disappeared_at, null);
}));

test("API failure does not mark existing orders disappeared", withTestDb(async (db) => {
  await syncItemOrderBook("test_item", {
    db,
    now: "2026-08-19T10:00:00.000Z",
    fetchOrders: async () => ({ data: [order("A"), order("B"), order("C")] }),
  });
  await assert.rejects(
    syncItemOrderBook("test_item", {
      db,
      now: "2026-08-19T11:00:00.000Z",
      fetchOrders: async () => { throw new Error("network down"); },
    }),
    /network down/
  );

  assert.deepEqual(rows(db).map(row => [row.order_id, row.is_active]), [["A", 1], ["B", 1], ["C", 1]]);
  const state = getOrderBookStatus("test_item", { db, freshness: { now: "2026-08-19T11:00:00.000Z" } });
  assert.equal(state.lastSuccessfulSyncAt, "2026-08-19T10:00:00.000Z");
  assert.equal(state.storedActiveOrderCount, 3);
}));

test("duplicate simultaneous item syncs share one in-flight fetch", withTestDb(async (db) => {
  let fetchCount = 0;
  const fetchOrders = async () => {
    fetchCount++;
    await new Promise(resolve => setTimeout(resolve, 30));
    return { data: [order("A")] };
  };

  const [first, second] = await Promise.all([
    syncItemOrderBook("test_item", { db, now: "2026-08-19T10:00:00.000Z", fetchOrders }),
    syncItemOrderBook("test_item", { db, now: "2026-08-19T10:00:00.000Z", fetchOrders }),
  ]);

  assert.equal(fetchCount, 1);
  assert.equal(rows(db).length, 1);
  assert.equal(first.sync.fetched, 1);
  assert.equal(second.sync.fetched, 1);
}));

test("DB transaction failure rolls back orders and sync state", withTestDb(async (db) => {
  db.exec(
    "CREATE TRIGGER abort_sync_state_insert BEFORE INSERT ON market_order_sync_state " +
    "BEGIN SELECT RAISE(ABORT, 'sync state blocked'); END;"
  );

  await assert.rejects(
    syncItemOrderBook("test_item", {
      db,
      now: "2026-08-19T10:00:00.000Z",
      fetchOrders: async () => ({ data: [order("A")] }),
    }),
    /sync state blocked/
  );

  assert.equal(rows(db).length, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM market_order_sync_state").get().c, 0);
}));

test("empty successful order book marks previous orders inactive and updates state", withTestDb(async (db) => {
  await syncItemOrderBook("test_item", {
    db,
    now: "2026-08-19T10:00:00.000Z",
    fetchOrders: async () => ({ data: [order("A"), order("B")] }),
  });
  const result = await syncItemOrderBook("test_item", {
    db,
    now: "2026-08-19T11:00:00.000Z",
    fetchOrders: async () => ({ data: [] }),
  });

  assert.equal(result.sync.fetched, 0);
  assert.equal(result.sync.disappeared, 2);
  assert.deepEqual(rows(db).map(row => [row.order_id, row.is_active, row.disappeared_at]), [
    ["A", 0, "2026-08-19T11:00:00.000Z"],
    ["B", 0, "2026-08-19T11:00:00.000Z"],
  ]);

  const status = getOrderBookStatus("test_item", { db, freshness: { now: "2026-08-19T11:00:30.000Z" } });
  assert.equal(status.synced, true);
  assert.equal(status.lastSuccessfulSyncAt, "2026-08-19T11:00:00.000Z");
  assert.equal(status.storedActiveOrderCount, 0);
  assert.equal(status.configurationCount, 0);
}));

test("never synchronized status reports never_synced", withTestDb(async (db) => {
  const status = getOrderBookStatus("never_item", { db, freshness: { now: "2026-08-19T10:00:00.000Z" } });

  assert.equal(status.synced, false);
  assert.equal(status.lastSuccessfulSyncAt, null);
  assert.equal(status.ageSeconds, null);
  assert.equal(status.freshness, "never_synced");
  assert.equal(status.storedActiveOrderCount, 0);
  assert.equal(status.configurationCount, 0);
}));

test("freshness thresholds classify boundary values", () => {
  const thresholds = { freshSeconds: 300, agingSeconds: 1800 };

  assert.equal(classifyMarketFreshness(null, thresholds).state, "never_synced");
  assert.equal(classifyMarketFreshness("2026-08-19T10:00:00.000Z", { ...thresholds, now: "2026-08-19T10:04:59.000Z" }).state, "fresh");
  assert.equal(classifyMarketFreshness("2026-08-19T10:00:00.000Z", { ...thresholds, now: "2026-08-19T10:05:00.000Z" }).state, "aging");
  assert.equal(classifyMarketFreshness("2026-08-19T10:00:00.000Z", { ...thresholds, now: "2026-08-19T10:30:00.000Z" }).state, "aging");
  assert.equal(classifyMarketFreshness("2026-08-19T10:00:00.000Z", { ...thresholds, now: "2026-08-19T10:30:01.000Z" }).state, "stale");
});

test("different configurations are persisted under distinct market keys", withTestDb(async (db) => {
  const rank0 = order("rank0", { rank: 0, platinum: 7 });
  const rank5 = order("rank5", { rank: 5, platinum: 120 });
  const relic = order("relic", { subtype: "radiant", platinum: 8 });
  const ayatan = order("ayatan", { amberStars: 1, cyanStars: 3, platinum: 6 });

  await syncItemOrderBook("mixed_item", {
    db,
    now: "2026-08-19T10:00:00.000Z",
    fetchOrders: async () => ({ data: [rank0, rank5, relic, ayatan] }),
  });

  const stored = rows(db);
  assert.equal(new Set(stored.map(row => row.market_key)).size, 4);
  assert.ok(stored.some(row => row.market_key === marketKeyId(marketKeyForOrder(rank0, "mixed_item"))));
  assert.ok(stored.some(row => row.market_key === marketKeyId(marketKeyForOrder(relic, "mixed_item"))));
  assert.ok(stored.some(row => row.market_key === marketKeyId(marketKeyForOrder(ayatan, "mixed_item"))));

  const summary = buildStoredSummary("mixed_item", { db, freshness: { now: "2026-08-19T10:00:30.000Z" } });
  assert.equal(summary.configurationCount, 4);
  assert.equal(summary.freshness.state, "fresh");
}));

test("stored analysis exposes semantic valuation selections and coverage", withTestDb(async (db) => {
  db.prepare("INSERT INTO items (id, url_name, item_name) VALUES (?, ?, ?)").run("item-1", "test_item", "Test Item");
  db.prepare(
    "INSERT INTO item_statistics (url_name, rank, period, datetime, volume, median, avg_price) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run("test_item", null, "48h", "2026-08-19T09:00:00.000Z", 5, 21, 21);

  await syncItemOrderBook("test_item", {
    db,
    now: "2026-08-19T10:00:00.000Z",
    fetchOrders: async () => ({ data: [
      order("sell-1", { platinum: 20, user: { id: "u1", slug: "u1", status: "online" } }),
      order("sell-2", { platinum: 22, user: { id: "u2", slug: "u2", status: "ingame" } }),
      order("buy-1", { type: "buy", platinum: 18, user: { id: "u3", slug: "u3", status: "online" } }),
    ] }),
  });

  const analysis = buildStoredAnalysis("test_item", { db, freshness: { now: "2026-08-19T10:00:30.000Z" } });
  const config = analysis.configurations[0];

  assert.equal(config.selections.acquire.source, "executableAsk");
  assert.equal(config.selections.acquire.value, 20);
  assert.equal(config.selections.fair.source, "competitiveEstimate");
  assert.equal(config.selections.liquidate.source, "highestActiveBid");
  assert.equal(config.selections.historical.source, "historicalMedian");

  const coverage = getStoredMarketCoverage({ db, freshness: { now: "2026-08-19T10:00:30.000Z" } });
  assert.equal(coverage.itemsWithStoredOrderBooks, 1);
  assert.equal(coverage.freshness.fresh, 1);
  assert.equal(coverage.usableCompetitiveConfigurations, 1);
  assert.equal(coverage.historicalComparableConfigurations, 1);
}));
