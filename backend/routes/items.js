import { Router } from "express";
import { getDb } from "../db.js";
import { syncItems } from "../sync.js";

const router = Router();

//GET /api/items?search=ash
router.get("/",async (req,res)=>{
    const db = getDb();
    const q = req.query.search ? `%${req.query.search}%` : "%";
    const limit = req.query.limit ? Math.min(parseInt(req.query.limit), 1000) : null;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;
    const category = req.query.category || null;

    // If no pagination or category requested, return the legacy array (max 100)
    if (limit === null && !category) {
        const rows = db.prepare(
            "SELECT * FROM items WHERE item_name LIKE ? ORDER BY item_name LIMIT 100"
        ).all(q);
        return res.json(rows);
    }

    // Fetch a window of candidate rows, then optionally filter by category in JS.
    // We cap candidate fetch to 1000 to avoid large queries.
    const candidates = db.prepare(
        "SELECT * FROM items WHERE item_name LIKE ? ORDER BY item_name LIMIT ?"
    ).all(q, Math.min((limit || 100) * 4, 1000));

    let rows = candidates;
    if (category) {
        // Lazy-load classifier to avoid circular imports elsewhere
        const { classifyItem } = await import("../classify.js");
        rows = candidates.filter(r => classifyItem(r.item_name, r.url_name) === category);
    }

    const paged = rows.slice(offset, offset + (limit || 100));
    const more = rows.length > offset + (limit || 100);
    res.json({ items: paged, more });
});

router.post("/sync", async (req, res) => {
    try {
        await syncItems();
        const total = getDb().prepare("SELECT COUNT(*) as total FROM items").get().total;
        res.json({ ok: true, total });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
