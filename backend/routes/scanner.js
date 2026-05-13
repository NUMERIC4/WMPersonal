import { Router } from "express";
import { getDb } from "../db.js";
import { fetchPriceSnapshot } from "../sync.js";
import { fetchAndStoreStats } from "./stats.js";
import { classifyItem } from "../classify.js";

const router = Router();

let cancelFlag = false;

// GET /api/scanner/groups — list groups with item counts
router.get("/groups", (req, res) => {
  const db = getDb();
  const items = db.prepare("SELECT item_name, url_name FROM items").all();

  const counts = {};
  for (const item of items) {
    const g = classifyItem(item.item_name, item.url_name);
    if (g) counts[g] = (counts[g] ?? 0) + 1;
  }
  counts["All Items"] = items.length;

  res.json(counts);
});

// POST /api/scanner/cancel
router.post("/cancel", (req, res) => {
  cancelFlag = true;
  res.json({ cancelled: true });
});

// GET /api/scanner/run?group=Arcanes — SSE stream with progress
router.get("/run", async (req, res) => {
  const group = req.query.group ?? "All Items";
  cancelFlag = false;

  // SSE headers
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  function send(data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  const db = getDb();
  let items = db.prepare("SELECT item_name, url_name FROM items").all();

  // Filter by group
  if (group !== "All Items") {
    items = items.filter(i => classifyItem(i.item_name, i.url_name) === group);
  }

  // Sort: oldest snapshot first, never-fetched alphabetically at front
  const lastFetched = {};
  const snaps = db.prepare(
    "SELECT url_name, MAX(fetched_at) as last FROM price_snapshots GROUP BY url_name"
  ).all();
  for (const s of snaps) lastFetched[s.url_name] = s.last;

  items.sort((a, b) => {
    const fa = lastFetched[a.url_name], fb = lastFetched[b.url_name];
    if (!fa && !fb) return a.item_name.localeCompare(b.item_name);
    if (!fa) return -1;
    if (!fb) return 1;
    return fa < fb ? -1 : 1;
  });

  const total = items.length;
  send({ type: "start", total, group });

  let done = 0;
  for (const item of items) {
    if (cancelFlag) {
      send({ type: "cancelled", done, total });
      res.end();
      return;
    }

    try {
      const snap = await fetchPriceSnapshot(item.url_name);
      send({ type: "progress", done: ++done, total, item: item.item_name, snap });
    } catch (e) {
      send({ type: "progress", done: ++done, total, item: item.item_name, error: e.message });
    }
  }

  send({ type: "done", done, total });
  res.end();
});

export default router;