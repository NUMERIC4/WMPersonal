import "dotenv/config";
import express from "express";
import cors from "cors";
import { initDb } from "./db.js";
import { syncItems } from "./sync.js";
import { startScheduler } from "./scheduler.js";
import itemsRouter        from "./routes/items.js";
import pricesRouter       from "./routes/prices.js";
import usersRouter        from "./routes/users.js";
import favouritesRouter   from "./routes/favourites.js";
import statsRouter        from "./routes/stats.js";
import scannerRouter      from "./routes/scanner.js";
import profitRouter       from "./routes/profit.js";
import timeanalysisRouter from "./routes/timeanalysis.js";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use("/api/items",        itemsRouter);
app.use("/api/prices",       pricesRouter);
app.use("/api/users",        usersRouter);
app.use("/api/favourites",   favouritesRouter);
app.use("/api/stats",        statsRouter);
app.use("/api/scanner",      scannerRouter);
app.use("/api/profit",       profitRouter);
app.use("/api/timeanalysis", timeanalysisRouter);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

initDb();
syncItems();
startScheduler();

app.listen(PORT, () => {
  console.log(`WMPersonal backend running on http://localhost:${PORT}`);
});