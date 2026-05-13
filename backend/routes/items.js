import { Router } from "express";
import { getDb } from "../db.js";
import { syncItems } from "../sync.js";

const router = Router();

//GET /api/items?search=ash
router.get("/",(req,res)=>{
    const db = getDb();
    const search = req.query.search ? `%${req.query.search}%` : "%";
    const rows = db.prepare(
        "SELECT * FROM items WHERE item_name LIKE ? ORDER BY item_name LIMIT 100"
    ).all(search);
    res.json(rows);
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
