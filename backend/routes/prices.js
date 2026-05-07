import { Router } from "express";
import { getDb } from "../db.js";
import { fetchPriceSnapshot } from "../sync.js";
import { queueLength } from "../queue.js";

const router = Router();

// POST /api/prices/fetch  { url_name: "ash_prime_set" }
router.post("/fetch", async (req, res) => {
  const url_name = req.body?.url_name;
  if (!url_name) return res.status(400).json({ error: "url_name required" });
  try {
    const snapshot = await fetchPriceSnapshot(url_name);
    res.json({ snapshot, queue: queueLength() });
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