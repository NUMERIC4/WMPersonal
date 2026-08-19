import { Router } from "express";
import { getDb } from "../db.js";
import { queueFetch } from "../queue.js";
import { fetchAndStoreStats } from "./stats.js";
import { getItemsForGroup } from "../groups.js";
import { buildProfitProfile } from "../marketAnalysis.js";
import { recordMarketDemand } from "../marketScheduler.js";
import { syncItemOrderBookFromOrders } from "../orderBookSync.js";

const router = Router();
const V2 = "https://api.warframe.market/v2";
let cancelFlag = false;

// Fetch full orders for an item — goes through the rate-limited queue
async function getFullOrders(url_name) {
  try {
    const json = await queueFetch(`${V2}/orders/item/${url_name}`, { priority: "normal" });
    return json.data ?? [];
  } catch (_) {
    return null;
  }
}

// POST /api/profit/scan { group, limit }
// Scans a group of items and returns profit profiles, streamed via SSE
router.get("/scan", async (req, res) => {
  const group = req.query.group ?? "Arcanes";
  const limit = Math.min(parseInt(req.query.limit ?? "50"), 200);
  cancelFlag = false;

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  function send(data) { res.write(`data: ${JSON.stringify(data)}\n\n`); }

  const items = getItemsForGroup(group).slice(0, limit);
  const total = items.length;
  send({ type: "start", total, group });

  const profiles = [];
  let done = 0;

  for (const item of items) {
    if (cancelFlag) {
      send({ type: "cancelled", profiles });
      res.end();
      return;
    }

    try {
      // Fetch stats and orders in parallel
      const [_, fetchedOrders] = await Promise.all([
        fetchAndStoreStats(item.url_name).catch(() => {}),
        getFullOrders(item.url_name),
      ]);
      const orders = fetchedOrders ?? [];
      if (fetchedOrders) {
        try {
          recordMarketDemand(item.url_name, "profit");
          await syncItemOrderBookFromOrders(item.url_name, fetchedOrders);
        } catch (_) {}
      }

      const ranks = [...new Set(orders.map(o => o.rank ?? null))];
      const db2 = getDb();

      for (const rank of ranks) {
        const stats90 = db2.prepare(
          "SELECT * FROM item_statistics WHERE url_name=? AND period='90d' AND (rank=? OR (rank IS NULL AND ? IS NULL)) ORDER BY datetime DESC LIMIT 30"
        ).all(item.url_name, rank, rank);

        const profile = buildProfitProfile(
          item.url_name,
          item.item_name,
          rank,
          item.max_rank,
          item.standing_cost,
          orders,
          stats90
        );
        console.debug(
          `profit valuation ${item.url_name} rank ${rank ?? "default"}: ` +
          `acquire=${profile.valuationSources?.acquisition?.source ?? profile.valuationSources?.acquisition?.reason}, ` +
          `resale=${profile.valuationSources?.resale?.source ?? profile.valuationSources?.resale?.reason}, ` +
          `liquidate=${profile.valuationSources?.liquidation?.source ?? profile.valuationSources?.liquidation?.reason}`
        );
        if (profile.margin !== null || profile.vol90d > 0) profiles.push(profile);
      }

      send({ type: "progress", done: ++done, total, item: item.item_name });
    } catch (e) {
      send({ type: "progress", done: ++done, total, item: item.item_name, error: e.message });
    }
  }

  // Sort by score desc
  profiles.sort((a, b) => b.score - a.score);
  send({ type: "done", profiles });
  res.end();
});

router.post("/cancel", (req, res) => {
  cancelFlag = true;
  res.json({ cancelled: true });
});

export default router;
