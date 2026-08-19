import { Router } from "express";
import { queueFetch } from "../queue.js";
import { analyzeOrders, analyzeOrdersByMarketKey } from "../marketAnalysis.js";
import { buildStoredAnalysis, buildStoredSummary, getOrderBookStatus, getStoredMarketCoverage, syncItemOrderBook } from "../orderBookSync.js";
import { getMarketSchedulerStatus, getSchedulerDebugRows, recordMarketDemand } from "../marketScheduler.js";

const router = Router();
const V2 = "https://api.warframe.market/v2";

router.get("/scheduler/status", (req, res) => {
  try {
    res.json(getMarketSchedulerStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/scheduler/debug", (req, res) => {
  try {
    res.json({ rows: getSchedulerDebugRows() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/coverage", (req, res) => {
  try {
    res.json(getStoredMarketCoverage());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:url_name/summary", async (req, res) => {
  const { url_name } = req.params;
  const rank = req.query.rank !== undefined ? Number(req.query.rank) : undefined;

  if (!url_name) return res.status(400).json({ error: "url_name required" });
  if (req.query.rank !== undefined && !Number.isInteger(rank)) {
    return res.status(400).json({ error: "rank must be an integer" });
  }

  try {
    const json = await queueFetch(`${V2}/orders/item/${encodeURIComponent(url_name)}`);
    const orders = Array.isArray(json.data) ? json.data : [];
    const options = req.query.rank !== undefined ? { rank } : {};
    const filteredOrders = req.query.rank !== undefined
      ? orders.filter(order => (order.rank ?? null) === rank)
      : orders;
    const aggregate = analyzeOrders(filteredOrders, options);
    const configurations = analyzeOrdersByMarketKey(filteredOrders, url_name);

    res.json({
      url_name,
      fetchedOrderCount: orders.length,
      filteredOrderCount: filteredOrders.length,
      configurationCount: configurations.length,
      aggregateIncludesMultipleConfigurations: configurations.length > 1,
      aggregate: {
        ...aggregate,
        spread: configurations.length === 1 ? aggregate.spread : null,
      },
      configurations,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:url_name/refresh", async (req, res) => {
  const { url_name } = req.params;
  if (!url_name) return res.status(400).json({ error: "url_name required" });

  try {
    recordMarketDemand(url_name, "manual_refresh");
    res.json(await syncItemOrderBook(url_name, { priority: "high" }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:url_name/demand", (req, res) => {
  const { url_name } = req.params;
  const source = req.body?.source ?? "market_view";
  if (!url_name) return res.status(400).json({ error: "url_name required" });

  try {
    res.json(recordMarketDemand(url_name, source));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:url_name/status", (req, res) => {
  const { url_name } = req.params;
  if (!url_name) return res.status(400).json({ error: "url_name required" });

  try {
    res.json(getOrderBookStatus(url_name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:url_name/stored-summary", (req, res) => {
  const { url_name } = req.params;
  if (!url_name) return res.status(400).json({ error: "url_name required" });

  try {
    res.json(buildStoredSummary(url_name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:url_name/analysis", (req, res) => {
  const { url_name } = req.params;
  if (!url_name) return res.status(400).json({ error: "url_name required" });

  try {
    res.json(buildStoredAnalysis(url_name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
