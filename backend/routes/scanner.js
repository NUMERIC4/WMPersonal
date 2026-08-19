import { Router } from "express";
import { getDb } from "../db.js";
import { fetchPriceSnapshot } from "../sync.js";
import { getItemsForGroup, listGroupCounts, getStandingSource } from "../groups.js";
import { recordMarketDemands } from "../marketScheduler.js";
import { buildStoredAnalysis } from "../orderBookSync.js";
import { getMarketValue } from "../marketAnalysis.js";

const router = Router();
let cancelFlag = false;

function isDefaultMarketKey(key) {
  return ["rank", "subtype", "charges", "amberStars", "cyanStars"]
    .every(field => key?.[field] === null || key?.[field] === undefined);
}

export function storedFreshScannerValuation(urlName, options = {}) {
  try {
    const analysis = buildStoredAnalysis(urlName, options);
    if (analysis.freshness?.state !== "fresh") return null;
    const config = analysis.configurations.find(row => isDefaultMarketKey(row.marketKey)) ?? analysis.configurations[0];
    if (!config?.valuation) return null;
    const fair = getMarketValue(config.valuation, "fair", { freshness: analysis.freshness, legacy: config.legacySnapshot });
    const acquire = getMarketValue(config.valuation, "acquire", { freshness: analysis.freshness, legacy: config.legacySnapshot });
    console.debug(`scanner valuation ${urlName}: fair=${fair.source ?? fair.reason}, acquire=${acquire.source ?? acquire.reason}`);
    return {
      fair: fair.value,
      buyNow: acquire.value,
      confidence: fair.confidence ?? acquire.confidence,
      sources: { fair, acquire },
      configuration: config.marketKey,
      freshness: analysis.freshness,
    };
  } catch (_) {
    return null;
  }
}

router.get("/groups", (req, res) => {
  res.json(listGroupCounts());
});

router.get("/items", (req, res) => {
  const group = req.query.group ?? "All Items";
  res.json(getItemsForGroup(group));
});

router.post("/cancel", (req, res) => {
  cancelFlag = true;
  res.json({ cancelled: true });
});

router.get("/run", async (req, res) => {
  const group = req.query.group ?? "All Items";
  cancelFlag = false;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  function send(data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  const db = getDb();
  const items = getItemsForGroup(group);

  const lastFetched = {};
  const snaps = db.prepare(
    "SELECT url_name, MAX(fetched_at) as last FROM price_snapshots GROUP BY url_name"
  ).all();
  for (const snap of snaps) lastFetched[snap.url_name] = snap.last;

  items.sort((a, b) => {
    const fa = lastFetched[a.url_name];
    const fb = lastFetched[b.url_name];
    if (!fa && !fb) return a.item_name.localeCompare(b.item_name);
    if (!fa) return -1;
    if (!fb) return 1;
    return fa < fb ? -1 : 1;
  });

  const total = items.length;
  send({ type: "start", total, group });

  let done = 0;
  const demandCandidates = [];
  for (const item of items) {
    if (cancelFlag) {
      send({ type: "cancelled", done, total });
      res.end();
      return;
    }

    try {
      const snap = await fetchPriceSnapshot(item.url_name);
      if (snap?.min !== null && snap?.min !== undefined) {
        demandCandidates.push({ url_name: item.url_name, min: snap.min });
      }
      send({
        type: "progress",
        done: ++done,
        total,
        item: item.item_name,
        standing_cost: item.standing_cost,
        standing_source: getStandingSource(item.url_name),
        snap,
        marketValuation: storedFreshScannerValuation(item.url_name),
      });
    } catch (error) {
      send({ type: "progress", done: ++done, total, item: item.item_name, error: error.message });
    }
  }

  const demandSlugs = demandCandidates
    .sort((a, b) => a.min - b.min)
    .slice(0, 25)
    .map(item => item.url_name);
  try { recordMarketDemands(demandSlugs, "scanner"); } catch (_) {}

  send({ type: "done", done, total });
  res.end();
});

export default router;
