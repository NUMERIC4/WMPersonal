import { Router } from "express";
import { getDb } from "../db.js";
import { fetchPriceSnapshot } from "../sync.js";
import { queueLength } from "../queue.js";

const router = Router();

// POST /api/prices/fetch  { url_name: "ash_prime_set", rank: 0 }
router.post("/fetch", async (req, res) => {
  const url_name = req.body?.url_name;
  const rank = req.body?.rank;
  if (!url_name) return res.status(400).json({ error: "url_name required" });
  try {
    const db = getDb();
    const itemRow = db.prepare("SELECT max_rank FROM items WHERE url_name = ?").get(url_name);
    const maxRank = itemRow?.max_rank ?? null;

    const snapshot = await fetchPriceSnapshot(url_name, rank ?? null);
    const rankSnapshots = [];

    if (rank == null && maxRank !== null && maxRank !== undefined && maxRank !== 0) {
      const rank0 = await fetchPriceSnapshot(url_name, 0).catch(() => null);
      const rankMax = await fetchPriceSnapshot(url_name, maxRank).catch(() => null);
      if (rank0) rankSnapshots.push({ rank: 0, snapshot: rank0 });
      if (rankMax) rankSnapshots.push({ rank: maxRank, snapshot: rankMax });
    }

    res.json({ snapshot, rankSnapshots, queue: queueLength() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prices/:url_name — price history for one item
router.get("/:url_name", (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM price_snapshots WHERE url_name = ? ORDER BY fetched_at DESC LIMIT 50"
  ).all(req.params.url_name);
  res.json(rows);
});

export default router;