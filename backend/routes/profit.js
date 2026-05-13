import { Router } from "express";
import { getDb } from "../db.js";
import { queueFetch } from "../queue.js";
import { fetchAndStoreStats } from "./stats.js";
import { getItemsForGroup } from "../groups.js";

const router = Router();
const V2 = "https://api.warframe.market/v2";
let cancelFlag = false;

// Fetch full orders for an item — goes through the rate-limited queue
async function getFullOrders(url_name) {
  try {
    const json = await queueFetch(`${V2}/orders/item/${url_name}`);
    return json.data ?? [];
  } catch (_) {
    return [];
  }
}

// Build profit profile for a single item+rank combo
function buildProfile(url_name, item_name, rank, maxRank, orders, stats90) {
  const sells   = orders.filter(o => o.type === "sell" && (o.rank ?? null) === rank);
  const buys    = orders.filter(o => o.type === "buy"  && (o.rank ?? null) === rank);
  const onSell  = sells.filter(o => o.user?.status === "ingame").map(o => o.platinum).sort((a,b) => a-b);
  const onBuy   = buys.filter(o  => o.user?.status === "ingame").map(o => o.platinum).sort((a,b) => b-a);
  const offSell = sells.filter(o => o.user?.status !== "ingame").map(o => o.platinum).sort((a,b) => a-b);

  const minSell = onSell[0]  ?? offSell[0] ?? null;
  const maxBuy  = onBuy[0]   ?? null;
  const margin  = minSell !== null && maxBuy !== null ? minSell - maxBuy : null;

  const totalVol90  = stats90.reduce((s, r) => s + (r.volume ?? 0), 0);
  const avgDaily    = stats90.length ? totalVol90 / stats90.length : 0;
  const medians     = stats90.map(r => r.median).filter(Boolean);
  const avgMedian   = medians.length ? medians.reduce((s,v) => s+v,0) / medians.length : null;

  // Sell speed: avg trades per day over last 90d
  const sellSpeed = Math.round(avgDaily * 10) / 10;

  // Score: margin * sellSpeed (higher = more profitable & liquid)
  const score = margin !== null && sellSpeed > 0 ? Math.round(margin * sellSpeed) : 0;

  return {
    url_name, item_name, rank, maxRank,
    minSell, maxBuy, margin,
    offlineMinSell: offSell[0] ?? null,
    onlineSellers:  onSell.length,
    onlineBuyers:   onBuy.length,
    offlineSellers: offSell.length,
    vol90d:         totalVol90,
    avgDaily90d:    sellSpeed,
    avgMedian90d:   avgMedian ? Math.round(avgMedian * 10) / 10 : null,
    score,
  };
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
      const [_, orders] = await Promise.all([
        fetchAndStoreStats(item.url_name).catch(() => {}),
        getFullOrders(item.url_name),
      ]);

      const ranks = [...new Set(orders.map(o => o.rank ?? null))];
      const db2 = getDb();

      for (const rank of ranks) {
        const stats90 = db2.prepare(
          "SELECT * FROM item_statistics WHERE url_name=? AND period='90d' AND (rank=? OR (rank IS NULL AND ? IS NULL)) ORDER BY datetime DESC LIMIT 30"
        ).all(item.url_name, rank, rank);

        const profile = buildProfile(item.url_name, item.item_name, rank, item.max_rank, orders, stats90);
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
