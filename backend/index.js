import "dotenv/config";
import express from "express";
import cors from "cors";
import { initDb } from "./db.js";
import { syncItems } from "./sync.js";
import { startScheduler } from "./scheduler.js";
import itemsRouter      from "./routes/items.js";
import pricesRouter     from "./routes/prices.js";
import usersRouter      from "./routes/users.js";
import favouritesRouter from "./routes/favourites.js";
// ── NEW ──────────────────────────────────────────────────────────────────────
import statsRouter        from "./routes/stats.js";
import scannerRouter      from "./routes/scanner.js";
import profitRouter       from "./routes/profit.js";
import timeanalysisRouter from "./routes/timeanalysis.js";
import customGroupsRouter from "./routes/customgroups.js";
import alecaframeRouter   from "./routes/alecaframe.js";
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Existing routes (unchanged)
app.use("/api/items",      itemsRouter);
app.use("/api/prices",     pricesRouter);
app.use("/api/users",      usersRouter);
app.use("/api/favourites", favouritesRouter);

// ── NEW routes ───────────────────────────────────────────────────────────────
app.use("/api/stats",         statsRouter);        // GET /api/stats/:url_name + /summary
app.use("/api/scanner",       scannerRouter);      // GET /api/scanner/groups, /run, POST /cancel
app.use("/api/profit",        profitRouter);       // GET /api/profit?mode=all&min_margin=15
app.use("/api/timeanalysis",  timeanalysisRouter); // GET /api/timeanalysis/:url_name, POST /batch
app.use("/api/customgroups",  customGroupsRouter); // GET/POST /api/customgroups, /npc, /npc/:syndicate
app.use("/api/alecaframe",    alecaframeRouter);   // GET /api/alecaframe/summary, /trades, /relics
// ─────────────────────────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

initDb();
syncItems();
startScheduler();

app.listen(PORT, () => {
  console.log(`WMPersonal backend running on http://localhost:${PORT}`);
});
