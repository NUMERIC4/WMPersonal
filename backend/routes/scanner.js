import { Router } from "express";
import { getDb } from "../db.js";
import { fetchPriceSnapshot } from "../sync.js";
import { getItemsForGroup, listGroupCounts } from "../groups.js";

const router = Router();
let cancelFlag = false;

router.get("/groups", (req, res) => {
  res.json(listGroupCounts());
});

router.get("/items", (req, res) => {
  const group = req.query.group ?? "All Items";
  res.json(getItemsForGroup(group));
});

router.post("/cancel", (req, res) => {
  cancelFlag = true;
  res.json({ cancelled: true });
});

router.get("/run", async (req, res) => {
  const group = req.query.group ?? "All Items";
  cancelFlag = false;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  function send(data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  const db = getDb();
  const items = getItemsForGroup(group);

  const lastFetched = {};
  const snaps = db.prepare(
    "SELECT url_name, MAX(fetched_at) as last FROM price_snapshots GROUP BY url_name"
  ).all();
  for (const snap of snaps) lastFetched[snap.url_name] = snap.last;

  items.sort((a, b) => {
    const fa = lastFetched[a.url_name];
    const fb = lastFetched[b.url_name];
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
    } catch (error) {
      send({ type: "progress", done: ++done, total, item: item.item_name, error: error.message });
    }
  }

  send({ type: "done", done, total });
  res.end();
});

export default router;
