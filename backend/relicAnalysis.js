import { getDb } from "./db.js";
import { getMarketValue } from "./marketAnalysis.js";
import { buildStoredAnalysis } from "./orderBookSync.js";
import { classifyMarketFreshness } from "./marketFreshness.js";

export const REFINEMENTS = ["Intact", "Exceptional", "Flawless", "Radiant"];

export const TRACE_COSTS = {
  Intact: 0,
  Exceptional: 25,
  Flawless: 50,
  Radiant: 100,
};

export const STANDARD_RELIC_PROBABILITIES = {
  Common: { Intact: 25.33, Exceptional: 23.33, Flawless: 20, Radiant: 16.67 },
  Uncommon: { Intact: 11, Exceptional: 13, Flawless: 17, Radiant: 20 },
  Rare: { Intact: 2, Exceptional: 4, Flawless: 6, Radiant: 10 },
};

function round2(value) {
  return value === null || value === undefined ? null : Math.round(value * 100) / 100;
}

export function chanceToProbability(chancePercent) {
  return Number.isFinite(chancePercent) ? chancePercent / 100 : 0;
}

export function probabilitySums(rewards) {
  return Object.fromEntries(REFINEMENTS.map(refinement => [
    refinement,
    round2(rewards.reduce((sum, reward) => sum + (reward.chances?.[refinement] ?? 0), 0)),
  ]));
}

export function inferRarityFromChances(chances, tolerance = 0.05) {
  for (const [rarity, model] of Object.entries(STANDARD_RELIC_PROBABILITIES)) {
    if (REFINEMENTS.every(refinement => Math.abs((chances?.[refinement] ?? -999) - model[refinement]) <= tolerance)) {
      return rarity;
    }
  }
  return "Custom";
}

export function classifyRelicProbabilityModel(rewards, tolerance = 0.15) {
  if (!rewards.length) return { model: "unsupported", reason: "no_rewards" };
  if (!REFINEMENTS.every(refinement => rewards.every(reward => Number.isFinite(reward.chances?.[refinement])))) {
    return { model: "unsupported", reason: "missing_refinement_chance" };
  }
  const sums = probabilitySums(rewards);
  if (!REFINEMENTS.every(refinement => Math.abs(sums[refinement] - 100) <= tolerance)) {
    return { model: "custom", reason: "probability_sum_not_standard", sums };
  }
  const counts = rewards.reduce((acc, reward) => {
    const rarity = inferRarityFromChances(reward.chances);
    acc[rarity] = (acc[rarity] ?? 0) + 1;
    return acc;
  }, {});
  const standard = counts.Common === 3 && counts.Uncommon === 2 && counts.Rare === 1 && !counts.Custom;
  return {
    model: standard ? "standard" : "custom",
    reason: standard ? null : "source_probability_distribution_is_not_standard_3_2_1",
    sums,
  };
}

export function calculateRelicExpectedValues(rewards) {
  const byRefinement = {};
  for (const refinement of REFINEMENTS) {
    const rewardContributions = rewards.map(reward => {
      const chance = reward.chances?.[refinement] ?? 0;
      const value = reward.value?.value ?? 0;
      return {
        rewardName: reward.rewardName,
        chance,
        value,
        contribution: round2(chanceToProbability(chance) * value),
        valueSource: reward.value?.source ?? null,
      };
    });
    const expectedValue = round2(rewardContributions.reduce((sum, row) => sum + row.contribution, 0));
    byRefinement[refinement] = { expectedValue, rewardContributions };
  }
  return byRefinement;
}

export function calculateTraceEfficiency(expectedValues) {
  const intact = expectedValues.Intact?.expectedValue ?? null;
  return Object.fromEntries(REFINEMENTS.map(refinement => {
    if (refinement === "Intact" || intact === null) {
      return [refinement, { gain: 0, traceCost: TRACE_COSTS[refinement], platinumPerTrace: null }];
    }
    const gain = round2((expectedValues[refinement]?.expectedValue ?? 0) - intact);
    return [refinement, {
      gain,
      traceCost: TRACE_COSTS[refinement],
      platinumPerTrace: TRACE_COSTS[refinement] ? round2(gain / TRACE_COSTS[refinement]) : null,
    }];
  }));
}

export function selectBestRefinements(expectedValues, traceEfficiency) {
  const highestEV = REFINEMENTS
    .map(refinement => ({ refinement, expectedValue: expectedValues[refinement]?.expectedValue ?? null }))
    .filter(row => row.expectedValue !== null)
    .sort((a, b) => b.expectedValue - a.expectedValue)[0] ?? null;

  const bestTraceEfficiency = REFINEMENTS
    .filter(refinement => refinement !== "Intact")
    .map(refinement => ({ refinement, ...(traceEfficiency[refinement] ?? {}) }))
    .filter(row => row.platinumPerTrace !== null)
    .sort((a, b) => b.platinumPerTrace - a.platinumPerTrace)[0] ?? null;

  return { highestEV, bestTraceEfficiency };
}

function latestLegacySnapshot(db, urlName) {
  return db.prepare("SELECT * FROM price_snapshots WHERE url_name = ? ORDER BY fetched_at DESC LIMIT 1").get(urlName) ?? null;
}

function historicalSummary(db, urlName) {
  const rows = db.prepare(
    "SELECT * FROM item_statistics WHERE url_name = ? AND period = '48h' AND rank IS NULL ORDER BY datetime DESC LIMIT 24"
  ).all(urlName);
  const volume = rows.reduce((sum, row) => sum + (row.volume ?? 0), 0);
  const medians = rows.map(row => row.median).filter(Number.isFinite);
  const average = rows.map(row => row.avg_price).filter(Number.isFinite);
  return {
    available: volume > 0 && medians.length > 0,
    period: "48h",
    volume,
    median: medians.length ? round2(medians.reduce((sum, value) => sum + value, 0) / medians.length) : null,
    average: average.length ? round2(average.reduce((sum, value) => sum + value, 0) / average.length) : null,
    reason: volume > 0 && medians.length > 0 ? null : "no_recent_statistics",
  };
}

function defaultStoredConfig(analysis) {
  return analysis.configurations.find(config => ["rank", "subtype", "charges", "amberStars", "cyanStars"].every(field => (
    config.marketKey?.[field] === null || config.marketKey?.[field] === undefined
  ))) ?? analysis.configurations[0] ?? null;
}

export function selectRewardMarketValue(marketUrlName, options = {}) {
  const db = options.db ?? getDb();
  if (!marketUrlName) {
    return { value: 0, source: "nonTradable", confidence: null, freshness: "unavailable", reason: "non_tradable_reward" };
  }

  const legacy = latestLegacySnapshot(db, marketUrlName);
  try {
    const analysis = buildStoredAnalysis(marketUrlName, { db, freshness: options.freshness });
    const config = defaultStoredConfig(analysis);
    if (config?.valuation) {
      return getMarketValue(config.valuation, "resale", { freshness: analysis.freshness, legacy });
    }
  } catch (_) {}

  const historical = historicalSummary(db, marketUrlName);
  const synthetic = {
    competitiveEstimate: null,
    historical,
    confidence: { level: historical.available ? "LOW" : "VERY_LOW", reasons: [] },
    freshness: classifyMarketFreshness(null, options.freshness ?? {}),
  };
  return getMarketValue(synthetic, "resale", { freshness: synthetic.freshness, legacy });
}

export function classifyRelicConfidence(rewardRows) {
  const tradable = rewardRows.filter(reward => reward.isTradable);
  const valued = tradable.filter(reward => reward.value?.value !== null && reward.value?.value !== undefined);
  const legacy = tradable.filter(reward => reward.value?.source?.startsWith("legacy"));
  const unavailable = tradable.filter(reward => !reward.value?.source);
  const current = tradable.filter(reward => reward.value?.source === "competitiveEstimate");
  const reasons = [];
  let level = "HIGH";

  if (!tradable.length) {
    return { level: "VERY_LOW", reasons: ["no tradable rewards"] };
  }
  reasons.push(`${valued.length}/${tradable.length} tradable rewards valued`);
  if (valued.length < tradable.length) level = "LOW";
  if (unavailable.length) reasons.push(`${unavailable.length} tradable rewards unavailable`);
  if (legacy.length) {
    reasons.push(`${legacy.length} rewards use legacy price fallback`);
    if (level === "HIGH") level = "MEDIUM";
  }
  if (current.length) reasons.push(`${current.length} rewards use current competitive valuation`);
  if (tradable.some(reward => reward.rarity === "Rare" && !reward.value?.source)) {
    reasons.push("rare reward price unavailable");
    level = "LOW";
  }
  if (valued.length === 0) level = "VERY_LOW";
  return { level, reasons };
}
