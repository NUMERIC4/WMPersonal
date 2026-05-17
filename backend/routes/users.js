import { Router } from "express";
import { getDb } from "../db.js";
import { fetchUserOrders } from "../userFetch.js";

const router = Router();

router.get("/:slug/orders", async (req, res) => {
  const { slug } = req.params;
  try {
    const json = await fetchUserOrders((slug || "").toLowerCase());
    const orders = (json && json.data) ? json.data : [];
    const db = getDb();

    const enriched = orders.map((o) => {
      const row = db.prepare("SELECT item_name, url_name, max_rank FROM items WHERE id = ?").get(o.itemId ?? "");
      return {
        id:         o.id,
        item_slug:  row?.url_name ?? "",
        item_name:  row?.item_name ?? "Unknown",
        order_type: o.type,
        platinum:   o.platinum,
        quantity:   o.quantity,
        visible:    o.visible,
        rank:       o.rank ?? null,
        max_rank:   row?.max_rank ?? null,
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;