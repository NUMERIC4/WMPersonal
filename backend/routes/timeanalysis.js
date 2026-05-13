import { Router } from "express";
import { getDb } from "../db.js";
import { fetchAndStoreStats } from "./stats.js";

const router = Router();
let cancelFlag = false;

// Aggregate statistics by hour-of-day and day-of-week
function aggregateByTime(rows) {
  const byHour = Array.from({ length: 24 }, (_, h) => ({
    hour: h, label: `${h}:00`, volume: 0, avgPrice: 0, count: 0, medianSum: 0
  }));
  const byDay = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => ({
    day: i, label: d, volume: 0, avgPrice: 0, count: 0, medianSum: 0
  }));

  for (const r of rows) {
    const dt = new Date(r.datetime);
    const h  = dt.getUTCHours();
    const d  = dt.getUTCDay();

    byHour[h].volume    += r.volume ?? 0;
    byHour[h].medianSum += r.median ?? 0;
    byHour[h].count     += 1;

    byDay[d].volume    += r.volume ?? 0;
    byDay[d].medianSum += r.median ?? 0;
    byDay[d].count     += 1;
  }

  // Calculate averages
  for (const h of byHour) {
    h.avgMedian = h.count ? Math.round((h.medianSum / h.count) * 10) / 10 : null;
    h.avgVolume = h.count ? Math.round((h.volume    / h.count) * 10) / 10 : null;
    delete h.medianSum;
  }
  for (const d of byDay) {
    d.avgMedian = d.count ? Math.round((d.medianSum / d.count) * 10) / 10 : null;
    d.avgVolume = d.count ? Math.round((d.volume    / d.count) * 10) / 10 : null;
    delete d.medianSum;
  }

  return { byHour, byDay };
}

// GET /api/timeanalysis/:url_name?rank=5
router.get("/:url_name", async (req, res) => {
  const { url_name } = req.params;
  const rank = req.query.rank !== undefined ? Number(req.query.rank) : null;

  try {
    await fetchAndStoreStats(url_name);
    const db = getDb();

    const rows = rank !== null
      ? db.prepare("SELECT * FROM item_statistics WHERE url_name=? AND period='48h' AND rank=? ORDER BY datetime ASC").all(url_name, rank)
      : db.prepare("SELECT * FROM item_statistics WHERE url_name=? AND period='48h' ORDER BY datetime ASC").all(url_name);

    if (!rows.length) return res.json({ byHour: [], byDay: [], message: "No data yet — run scanner first" });

    const result = aggregateByTime(rows);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/timeanalysis/batch — analyze multiple items at once
// Body: { url_names: [...], minVolume: 5, minMargin: 20, maxPrice: 500 }
router.post("/batch", async (req, res) => {
  const { url_names = [], minVolume = 0, minMargin = 0, maxPrice = 99999 } = req.body;
  cancelFlag = false;

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  function send(data) { res.write(`data: ${JSON.stringify(data)}\n\n`); }

  const db = getDb();
  const results = [];
  let done = 0;

  send({ type: "start", total: url_names.length });

  for (const url_name of url_names) {
    if (cancelFlag) {
      send({ type: "cancelled", results });
      res.end();
      return;
    }

    try {
      await fetchAndStoreStats(url_name);
      const rows = db.prepare(
        "SELECT * FROM item_statistics WHERE url_name=? AND period='48h' ORDER BY datetime ASC"
      ).all(url_name);

      if (!rows.length) { send({ type: "progress", done: ++done, total: url_names.length, url_name }); continue; }

      const { byHour, byDay } = aggregateByTime(rows);

      // Find best hour and day
      const bestHour = [...byHour].sort((a,b) => (b.avgVolume??0) - (a.avgVolume??0))[0];
      const bestDay  = [...byDay ].sort((a,b) => (b.avgVolume??0) - (a.avgVolume??0))[0];

      // Get current snapshot for price context
      const snap = db.prepare(
        "SELECT * FROM price_snapshots WHERE url_name=? ORDER BY fetched_at DESC LIMIT 1"
      ).get(url_name);

      const itemRow = db.prepare("SELECT item_name FROM items WHERE url_name=?").get(url_name);

      const totalVol = byHour.reduce((s,h) => s+(h.volume??0), 0);
      const avgPrice = snap?.avg_price ?? null;

      // Apply filters
      if (totalVol < minVolume) { send({ type: "progress", done: ++done, total: url_names.length, url_name }); continue; }
      if (avgPrice && avgPrice > maxPrice) { send({ type: "progress", done: ++done, total: url_names.length, url_name }); continue; }

      results.push({
        url_name,
        item_name:   itemRow?.item_name ?? url_name,
        totalVol48h: totalVol,
        avgPrice,
        bestHour:    bestHour.label,
        bestHourVol: bestHour.avgVolume,
        bestDay:     bestDay.label,
        bestDayVol:  bestDay.avgVolume,
        byHour,
        byDay,
      });

      send({ type: "progress", done: ++done, total: url_names.length, url_name });
    } catch (e) {
      send({ type: "progress", done: ++done, total: url_names.length, url_name, error: e.message });
    }
  }

  // Sort by totalVol descending
  results.sort((a,b) => b.totalVol48h - a.totalVol48h);
  send({ type: "done", results });
  res.end();
});

router.post("/cancel", (req, res) => {
  cancelFlag = true;
  res.json({ cancelled: true });
});

export default router;
