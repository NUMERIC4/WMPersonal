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

    // Cross-reference item names from local DB
    const db = getDb();
    const enriched = orders.map((o) => {
      const row = db.prepare("SELECT item_name FROM items WHERE url_name = ?").get(o.item?.slug ?? "");
      return {
        id:         o.id,
        item_slug:  o.item?.slug ?? "",
        item_name:  row?.item_name ?? o.item?.slug ?? "Unknown",
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