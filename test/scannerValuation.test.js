import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initDb, getDb } from "../backend/db.js";
import { storedFreshScannerValuation } from "../backend/routes/scanner.js";
import { syncItemOrderBook } from "../backend/orderBookSync.js";

function withTestDb(fn) {
  return async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wmpersonal-scanner-"));
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

function order(id, platinum) {
  return {
    id,
    type: "sell",
    platinum,
    quantity: 1,
    perTrade: true,
    visible: true,
    itemId: "item-1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    user: { id: `user-${id}`, slug: `user-${id}`, status: "online" },
  };
}

test("scanner valuation stays missing when no fresh stored order data exists", withTestDb(async (db) => {
  assert.equal(storedFreshScannerValuation("never_synced", { db }), null);

  await syncItemOrderBook("stale_item", {
    db,
    now: "2026-08-19T10:00:00.000Z",
    fetchOrders: async () => ({ data: [order("A", 10), order("B", 12)] }),
  });

  assert.equal(storedFreshScannerValuation("stale_item", {
    db,
    freshness: { now: "2026-08-19T11:00:01.000Z", freshSeconds: 300, agingSeconds: 1800 },
  }), null);
}));

test("scanner valuation reports stored semantic sources when fresh data exists", withTestDb(async (db) => {
  await syncItemOrderBook("fresh_item", {
    db,
    now: "2026-08-19T10:00:00.000Z",
    fetchOrders: async () => ({ data: [order("A", 10), order("B", 12), order("C", 14)] }),
  });

  const valuation = storedFreshScannerValuation("fresh_item", {
    db,
    freshness: { now: "2026-08-19T10:00:30.000Z" },
  });

  assert.equal(valuation.buyNow, 10);
  assert.equal(valuation.fair, 12);
  assert.equal(valuation.sources.acquire.source, "executableAsk");
  assert.equal(valuation.sources.fair.source, "competitiveEstimate");
}));
