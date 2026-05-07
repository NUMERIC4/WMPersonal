import { Router } from "express";
import { getDb } from "../db.js";
import { queueFetch } from "../queue.js";
import { fetchPriceSnapshot } from "../sync.js";
import { refreshFavourites } from "../scheduler.js";

const router = Router();

router.get("/", (req, res) => {
  const db = getDb();
  res.json(db.prepare("SELECT * FROM favourite_users ORDER BY added_at DESC").all());
});

router.post("/", (req, res) => {
  const { slug } = req.body;
  if (!slug) return res.status(400).json({ error: "slug required" });
  getDb().prepare("INSERT OR IGNORE INTO favourite_users (slug) VALUES (?)").run(slug.trim());
  res.json({ slug });
});

router.delete("/:slug", (req, res) => {
  getDb().prepare("DELETE FROM favourite_users WHERE slug = ?").run(req.params.slug);
  res.json({ deleted: req.params.slug });
});

router.get("/:slug/orders", async (req, res) => {
  const { slug } = req.params;
  try {
    const json = await queueFetch(`https://api.warframe.market/v2/orders/user/${slug}`);
    const orders = json.data ?? [];
    const db = getDb();

    const enriched = await Promise.all(orders.map(async (o) => {
      const itemRow = db.prepare("SELECT item_name, url_name, max_rank FROM items WHERE id = ?").get(o.itemId ?? "");
      const itemSlug = itemRow?.url_name ?? null;
      const rank     = o.rank ?? null;
      const maxRank  = itemRow?.max_rank ?? null;

      // Fetch live snapshot at the same rank as the order
      let liveSnap = null;
      if (itemSlug) {
        try { liveSnap = await fetchPriceSnapshot(itemSlug, rank); } catch (_) {}
      }

      const hist = itemSlug
        ? db.prepare("SELECT * FROM price_snapshots WHERE url_name = ? ORDER BY fetched_at DESC LIMIT 5").all(itemSlug)
        : [];

      return {
        id:         o.id,
        item_slug:  itemSlug ?? "",
        item_name:  itemRow?.item_name ?? "Unknown",
        order_type: o.type,
        platinum:   o.platinum,
        quantity:   o.quantity,
        visible:    o.visible,
        rank:       rank,
        max_rank:   liveSnap?.maxRank ?? maxRank,
        live:       liveSnap,
        history:    hist,
      };
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/refresh", async (req, res) => {
  try { res.json(await refreshFavourites()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;