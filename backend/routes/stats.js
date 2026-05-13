import { Router } from "express";
import { fetch } from "undici";
import { getDb } from "../db.js";

const router = Router();
const V1 = "https://api.warframe.market/v1";
const HEADERS = { "Accept": "application/json", "Language": "en", "Platform": "pc" };
const DEFAULT_MAX_AGE_MINUTES = 30;

function hasFreshStats(url_name, maxAgeMinutes = DEFAULT_MAX_AGE_MINUTES) {
  const db = getDb();
  const row = db.prepare(
    "SELECT MAX(fetched_at) as last FROM item_statistics WHERE url_name = ?"
  ).get(url_name);

  if (!row?.last) return false;
  const last = new Date(`${row.last}Z`).getTime();
  return Number.isFinite(last) && Date.now() - last < maxAgeMinutes * 60 * 1000;
}

// Fetch + store statistics for one item from v1 API
export async function fetchAndStoreStats(url_name, options = {}) {
  const maxAgeMinutes = options.maxAgeMinutes ?? DEFAULT_MAX_AGE_MINUTES;
  if (!options.force && hasFreshStats(url_name, maxAgeMinutes)) {
    return { cached: true };
  }

  const res  = await fetch(`${V1}/items/${url_name}/statistics`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Stats HTTP ${res.status} for ${url_name}`);
  const json = await res.json();
  const db   = getDb();

  const closed = json.payload?.statistics_closed ?? {};
  const rows48 = closed["48hours"] ?? [];
  const rows90 = closed["90days"]  ?? [];

  const insert = db.prepare(
    "INSERT OR REPLACE INTO item_statistics " +
    "(url_name, rank, period, datetime, volume, min_price, max_price, avg_price, median, moving_avg, wa_price) " +
    "VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  );

  const tx = db.transaction((rows, period) => {
    for (const r of rows) {
      insert.run(
        url_name,
        r.mod_rank ?? null,
        period,
        r.datetime,
        r.volume ?? 0,
        r.min_price ?? null,
        r.max_price ?? null,
        r.avg_price ?? null,
        r.median    ?? null,
        r.moving_avg ?? null,
        r.wa_price  ?? null,
      );
    }
  });

  tx(rows48, "48h");
  tx(rows90, "90d");

  return { rows48: rows48.length, rows90: rows90.length };
}

// GET /api/stats/:url_name?period=48h&rank=5
router.get("/:url_name", async (req, res) => {
  const { url_name } = req.params;
  const period = req.query.period ?? "48h";
  const rank   = req.query.rank !== undefined ? Number(req.query.rank) : null;
  const force  = req.query.force === "true";

  try {
    await fetchAndStoreStats(url_name, { force });

    const db = getDb();
    let rows;
    if (rank !== null) {
      rows = db.prepare(
        "SELECT * FROM item_statistics WHERE url_name=? AND period=? AND rank=? ORDER BY datetime ASC"
      ).all(url_name, period, rank);
    } else {
      rows = db.prepare(
        "SELECT * FROM item_statistics WHERE url_name=? AND period=? ORDER BY datetime ASC"
      ).all(url_name, period);
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats/:url_name/summary — aggregated profit-relevant summary per rank
router.get("/:url_name/summary", async (req, res) => {
  const { url_name } = req.params;
  try {
    await fetchAndStoreStats(url_name, { force: req.query.force === "true" });
    const db = getDb();

    // Get top buy + sell orders (online only, from v2 top endpoint)
    const { fetch: f } = await import("undici");
    const ordersRes = await f(`https://api.warframe.market/v2/orders/item/${url_name}`, { headers: HEADERS });
    const ordersJson = await ordersRes.json();
    const allOrders = ordersJson.data ?? [];

    const onlineSell = allOrders.filter(o => o.type === "sell" && o.user?.status === "ingame");
    const onlineBuy  = allOrders.filter(o => o.type === "buy"  && o.user?.status === "ingame");
    const offlineSell = allOrders.filter(o => o.type === "sell" && o.user?.status !== "ingame");

    // Get unique ranks present
    const ranks = [...new Set(allOrders.map(o => o.rank ?? null))];

    const summaries = ranks.map(rank => {
      const sellAtRank    = onlineSell.filter(o => (o.rank ?? null) === rank).map(o => o.platinum).sort((a,b) => a-b);
      const buyAtRank     = onlineBuy.filter(o  => (o.rank ?? null) === rank).map(o => o.platinum).sort((a,b) => b-a);
      const offAtRank     = offlineSell.filter(o => (o.rank ?? null) === rank).map(o => o.platinum).sort((a,b) => a-b);

      // 90d stats for this rank
      const stats90 = db.prepare(
        "SELECT * FROM item_statistics WHERE url_name=? AND period='90d' AND (rank=? OR (rank IS NULL AND ? IS NULL)) ORDER BY datetime DESC LIMIT 30"
      ).all(url_name, rank, rank);

      const totalVol90   = stats90.reduce((s, r) => s + (r.volume ?? 0), 0);
      const avgDaily90   = stats90.length ? totalVol90 / stats90.length : 0;
      const medianPrices = stats90.map(r => r.median).filter(Boolean);
      const avgMedian90  = medianPrices.length ? medianPrices.reduce((s,v) => s+v, 0) / medianPrices.length : null;

      // 48h stats
      const stats48 = db.prepare(
        "SELECT * FROM item_statistics WHERE url_name=? AND period='48h' AND (rank=? OR (rank IS NULL AND ? IS NULL)) ORDER BY datetime DESC LIMIT 48"
      ).all(url_name, rank, rank);
      const totalVol48 = stats48.reduce((s, r) => s + (r.volume ?? 0), 0);

      const minSell = sellAtRank[0]  ?? null;
      const maxBuy  = buyAtRank[0]   ?? null;
      const margin  = minSell !== null && maxBuy !== null ? minSell - maxBuy : null;

      return {
        rank,
        minSell,
        maxBuy,
        margin,
        offlineMinSell: offAtRank[0] ?? null,
        offlineCount:   offAtRank.length,
        onlineSellers:  sellAtRank.length,
        onlineBuyers:   buyAtRank.length,
        vol48h:         totalVol48,
        vol90d:         totalVol90,
        avgDaily90d:    Math.round(avgDaily90 * 10) / 10,
        avgMedian90d:   avgMedian90 ? Math.round(avgMedian90 * 10) / 10 : null,
      };
    });

    res.json({ url_name, summaries, allOrders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
