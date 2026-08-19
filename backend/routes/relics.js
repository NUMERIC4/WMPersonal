import { Router } from "express";
import { getDb } from "../db.js";
import { recordMarketDemands } from "../marketScheduler.js";
import { syncRelics } from "../relicSync.js";
import {
  calculateRelicExpectedValues,
  calculateTraceEfficiency,
  classifyRelicConfidence,
  selectBestRefinements,
  selectRewardMarketValue,
} from "../relicAnalysis.js";

const router = Router();

function rewardRow(row, value) {
  return {
    rewardName: row.reward_name,
    marketUrlName: row.market_url_name,
    itemName: row.item_name,
    rarity: row.rarity,
    sourceRarity: row.source_rarity,
    matchStatus: row.match_status,
    isTradable: !!row.is_tradable,
    chances: {
      Intact: row.chance_intact,
      Exceptional: row.chance_exceptional,
      Flawless: row.chance_flawless,
      Radiant: row.chance_radiant,
    },
    value,
  };
}

function getRelicValuation(id, options = {}) {
  const db = options.db ?? getDb();
  const relic = db.prepare("SELECT * FROM relics WHERE id = ?").get(id);
  if (!relic) return null;
  const rows = db.prepare(
    "SELECT * FROM relic_rewards WHERE relic_id = ? ORDER BY " +
    "CASE rarity WHEN 'Common' THEN 1 WHEN 'Uncommon' THEN 2 WHEN 'Rare' THEN 3 ELSE 4 END, reward_name"
  ).all(id);
  const rewards = rows.map(row => rewardRow(row, selectRewardMarketValue(row.market_url_name, { db })));
  const expectedValues = calculateRelicExpectedValues(rewards);
  const traceEfficiency = calculateTraceEfficiency(expectedValues);
  const best = selectBestRefinements(expectedValues, traceEfficiency);
  const confidence = classifyRelicConfidence(rewards);
  const tradableRewards = rewards.filter(reward => reward.isTradable);
  const pricedRewards = tradableRewards.filter(reward => reward.value?.value !== null && reward.value?.value !== undefined);
  const priceCoverage = {
    priced: pricedRewards.length,
    tradable: tradableRewards.length,
    total: rewards.length,
    sources: rewards.reduce((counts, reward) => {
      const key = reward.value?.source ?? reward.value?.reason ?? "unavailable";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
  };

  return {
    relic,
    rewards,
    expectedValues,
    traceEfficiency,
    best,
    confidence,
    priceCoverage,
  };
}

router.get("/", (req, res) => {
  const db = getDb();
  const search = `%${req.query.search ?? ""}%`;
  const era = req.query.era ?? null;
  const rows = era
    ? db.prepare("SELECT * FROM relics WHERE era = ? AND name LIKE ? ORDER BY era, code LIMIT 500").all(era, search)
    : db.prepare("SELECT * FROM relics WHERE name LIKE ? ORDER BY era, code LIMIT 500").all(search);
  const eras = db.prepare("SELECT era, COUNT(*) AS count FROM relics GROUP BY era ORDER BY era").all();
  res.json({ relics: rows, eras });
});

router.get("/:id", (req, res) => {
  const result = getRelicValuation(req.params.id);
  if (!result) return res.status(404).json({ error: "relic not found" });
  res.json(result);
});

router.post("/:id/demand", (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    "SELECT market_url_name FROM relic_rewards WHERE relic_id = ? AND market_url_name IS NOT NULL"
  ).all(req.params.id);
  const slugs = rows.map(row => row.market_url_name);
  res.json(recordMarketDemands(slugs, "relic_view"));
});

router.post("/sync", async (req, res) => {
  try {
    res.json(await syncRelics());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
