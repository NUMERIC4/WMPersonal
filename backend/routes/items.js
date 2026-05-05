import { Router } from "express";
import { getDb } from "../db.js";

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

export default router;
