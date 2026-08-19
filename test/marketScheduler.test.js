import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initDb, getDb } from "../backend/db.js";
import {
  calculateSchedulerPriority,
  cleanupOldMarketDemand,
  getSchedulerDebugRows,
  getMarketSchedulerStatus,
  getSchedulerCandidates,
  recordMarketDemand,
  runMarketSchedulerTick,
} from "../backend/marketScheduler.js";

function withTestDb(fn) {
  return async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wmpersonal-scheduler-"));
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

function syncState(db, urlName, at) {
  db.prepare(
    "INSERT INTO market_order_sync_state " +
    "(url_name, last_successful_sync_at, last_fetched_order_count, last_active_order_count, last_configuration_count) " +
    "VALUES (?, ?, 1, 1, 1)"
  ).run(urlName, at);
}

test("never-synced demanded item gets selected", withTestDb(async (db) => {
  recordMarketDemand("arcane_energize", "market_view", { db, now: "2026-08-19T10:00:00.000Z" });

  const candidates = getSchedulerCandidates({ db, nowMs: new Date("2026-08-19T10:01:00.000Z").getTime() });
  assert.equal(candidates[0].url_name, "arcane_energize");
}));

test("stale demanded item gets selected while fresh item is ineligible", withTestDb(async (db) => {
  recordMarketDemand("stale_item", "market_view", { db, now: "2026-08-19T10:00:00.000Z" });
  recordMarketDemand("fresh_item", "market_view", { db, now: "2026-08-19T10:00:00.000Z" });
  syncState(db, "stale_item", "2026-08-19T08:00:00.000Z");
  syncState(db, "fresh_item", "2026-08-19T09:59:00.000Z");

  const candidates = getSchedulerCandidates({ db, nowMs: new Date("2026-08-19T10:00:00.000Z").getTime() });
  assert.deepEqual(candidates.map(c => c.url_name), ["stale_item"]);
}));

test("recent demand outranks old demand", () => {
  const nowMs = new Date("2026-08-19T10:00:00.000Z").getTime();
  const recent = calculateSchedulerPriority({ source: "market_view", last_requested_at: "2026-08-19T09:59:30.000Z" }, { nowMs });
  const old = calculateSchedulerPriority({ source: "market_view", last_requested_at: "2026-08-19T02:00:00.000Z" }, { nowMs });

  assert.ok(recent.score > old.score);
});

test("higher-value demand source outranks low-value background demand", () => {
  const nowMs = new Date("2026-08-19T10:00:00.000Z").getTime();
  const manual = calculateSchedulerPriority({ source: "manual_refresh", last_requested_at: "2026-08-19T09:59:00.000Z" }, { nowMs });
  const favourite = calculateSchedulerPriority({ source: "favourite", last_requested_at: "2026-08-19T09:59:00.000Z" }, { nowMs });

  assert.ok(manual.score > favourite.score);
});

test("cold no-demand item is not automatically fetched", withTestDb(async (db) => {
  syncState(db, "cold_item", "2026-08-19T08:00:00.000Z");

  assert.equal(getSchedulerCandidates({ db }).length, 0);
}));

test("minimum refresh interval is respected", () => {
  const nowMs = new Date("2026-08-19T10:00:00.000Z").getTime();
  const priority = calculateSchedulerPriority({
    source: "market_view",
    last_requested_at: "2026-08-19T09:59:30.000Z",
    last_successful_sync_at: "2026-08-19T09:59:00.000Z",
  }, { nowMs, activeMinRefreshMs: 3 * 60 * 1000 });

  assert.equal(priority.eligible, false);
  assert.equal(priority.reason, "min_refresh_interval");
});

test("failure backoff suppresses repeated scheduler attempts", withTestDb(async (db) => {
  recordMarketDemand("bad_item", "market_view", { db, now: "2026-08-19T10:00:00.000Z" });
  const first = await runMarketSchedulerTick({
    db,
    now: "2026-08-19T10:01:00.000Z",
    syncFn: async () => { throw new Error("boom"); },
  });
  const secondCandidates = getSchedulerCandidates({ db, nowMs: new Date("2026-08-19T10:02:00.000Z").getTime() });

  assert.equal(first.results[0].ok, false);
  assert.equal(secondCandidates.length, 0);
}));

test("scheduler selects bounded batch size", withTestDb(async (db) => {
  recordMarketDemand("a", "market_view", { db, now: "2026-08-19T10:00:00.000Z" });
  recordMarketDemand("b", "market_view", { db, now: "2026-08-19T10:00:00.000Z" });
  const synced = [];

  const result = await runMarketSchedulerTick({
    db,
    now: "2026-08-19T10:01:00.000Z",
    batchSize: 1,
    syncFn: async (urlName) => {
      synced.push(urlName);
      return { sync: { syncedAt: "2026-08-19T10:01:00.000Z" } };
    },
  });

  assert.equal(result.selected, 1);
  assert.equal(synced.length, 1);
}));

test("scheduler does not start during tests by default", withTestDb(async (db) => {
  const status = getMarketSchedulerStatus({ db });

  assert.equal(status.enabled, false);
  assert.equal(status.running, false);
}));

test("favourite rows are dynamic demand candidates", withTestDb(async (db) => {
  db.prepare("INSERT INTO favourite_user_marketplace_items (slug, url_name, added_at) VALUES (?, ?, ?)").run(
    "some_user",
    "fav_item",
    "2026-08-19T10:00:00.000Z"
  );

  const candidates = getSchedulerCandidates({ db, nowMs: new Date("2026-08-19T10:01:00.000Z").getTime() });
  assert.equal(candidates[0].url_name, "fav_item");
  assert.equal(candidates[0].source, "favourite");
}));

test("scheduler debug rows include ineligible reasons and old demand cleanup is bounded", withTestDb(async (db) => {
  recordMarketDemand("fresh_item", "market_view", { db, now: "2026-08-19T10:00:00.000Z" });
  syncState(db, "fresh_item", "2026-08-19T09:59:00.000Z");
  recordMarketDemand("old_item", "market_view", { db, now: "2026-08-17T10:00:00.000Z" });

  const debug = getSchedulerDebugRows({ db, nowMs: new Date("2026-08-19T10:00:00.000Z").getTime() });
  const fresh = debug.find(row => row.url_name === "fresh_item");
  assert.equal(fresh.eligible, false);
  assert.equal(fresh.ineligibleReason, "min_refresh_interval");

  const cleanup = cleanupOldMarketDemand({
    db,
    nowMs: new Date("2026-08-19T10:00:00.000Z").getTime(),
    demandMaxAgeMs: 24 * 60 * 60 * 1000,
    limit: 1,
  });
  assert.equal(cleanup.deleted, 1);
}));
