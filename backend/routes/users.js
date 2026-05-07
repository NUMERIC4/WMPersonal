import { Router } from "express";
import { getDb } from "../db.js";
import { queueFetch } from "../queue.js";

const router = Router();

// GET /api/users/:slug/orders
router.get("/:slug/orders", async (req, res) => {
  const { slug } = req.params;
  try {
    const json = await queueFetch(`https://api.warframe.market/v2/orders/user/${slug}`);
    const orders = json.data ?? [];

    const db = getDb();
    const enriched = orders.map((o) => {
      // v2 orders only give itemId, look it up in local DB by id
      const row = db.prepare("SELECT item_name, url_name FROM items WHERE id = ?").get(o.itemId ?? "");
      return {
        id:         o.id,
        item_slug:  row?.url_name ?? "",
        item_name:  row?.item_name ?? "Unknown",
        order_type: o.type,
        platinum:   o.platinum,
        quantity:   o.quantity,
        visible:    o.visible,
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;