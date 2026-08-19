import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateRelicExpectedValues,
  calculateTraceEfficiency,
  classifyRelicConfidence,
  classifyRelicProbabilityModel,
  REFINEMENTS,
  selectBestRefinements,
  STANDARD_RELIC_PROBABILITIES,
} from "../backend/relicAnalysis.js";
import { buildRewardMarketMap, groupRelicSourceRows, mapRewardToMarketItem } from "../backend/relicSync.js";

function reward(rewardName, rarity, value) {
  return {
    rewardName,
    rarity,
    isTradable: value !== null,
    chances: STANDARD_RELIC_PROBABILITIES[rarity],
    value: value === null
      ? { value: 0, source: "nonTradable", reason: "non_tradable_reward" }
      : { value, source: "competitiveEstimate", confidence: "HIGH", freshness: "fresh" },
  };
}

function standardRewards(values = [5, 8, 10, 20, 30, 100]) {
  return [
    reward("Common A", "Common", values[0]),
    reward("Common B", "Common", values[1]),
    reward("Common C", "Common", values[2]),
    reward("Uncommon A", "Uncommon", values[3]),
    reward("Uncommon B", "Uncommon", values[4]),
    reward("Rare", "Rare", values[5]),
  ];
}

test("standard relic probabilities sum within rounding tolerance", () => {
  const model = classifyRelicProbabilityModel(standardRewards());
  assert.equal(model.model, "standard");
  for (const refinement of REFINEMENTS) {
    assert.ok(Math.abs(model.sums[refinement] - 100) <= 0.15);
  }
});

test("calculates EV for all normal refinements", () => {
  const ev = calculateRelicExpectedValues(standardRewards());

  assert.equal(ev.Intact.expectedValue, 13.33);
  assert.equal(ev.Exceptional.expectedValue, 15.87);
  assert.equal(ev.Flawless.expectedValue, 19.1);
  assert.equal(ev.Radiant.expectedValue, 23.83);
});

test("non-tradable reward contributes zero trade EV", () => {
  const rewards = standardRewards();
  rewards[0] = reward("Forma Blueprint", "Common", null);
  const ev = calculateRelicExpectedValues(rewards);
  const formaContribution = ev.Intact.rewardContributions.find(row => row.rewardName === "Forma Blueprint");

  assert.equal(formaContribution.value, 0);
  assert.equal(formaContribution.contribution, 0);
});

test("missing reward valuation contributes zero and lowers confidence", () => {
  const rewards = standardRewards();
  rewards[5].value = { value: null, source: null, reason: "no_fair_value" };
  const ev = calculateRelicExpectedValues(rewards);
  const confidence = classifyRelicConfidence(rewards);

  assert.equal(ev.Radiant.rewardContributions.find(row => row.rewardName === "Rare").contribution, 0);
  assert.equal(confidence.level, "LOW");
  assert.ok(confidence.reasons.includes("rare reward price unavailable"));
});

test("expensive common reward can make refinement reduce EV", () => {
  const ev = calculateRelicExpectedValues(standardRewards([100, 5, 5, 10, 10, 20]));

  assert.ok(ev.Radiant.expectedValue < ev.Intact.expectedValue);
});

test("expensive rare reward makes radiant increase EV strongly", () => {
  const ev = calculateRelicExpectedValues(standardRewards([5, 5, 5, 10, 10, 300]));
  const trace = calculateTraceEfficiency(ev);
  const best = selectBestRefinements(ev, trace);

  assert.ok(ev.Radiant.expectedValue - ev.Intact.expectedValue > 20);
  assert.equal(best.highestEV.refinement, "Radiant");
  assert.equal(best.bestTraceEfficiency.refinement, "Flawless");
});

test("trace efficiency and best refinement selections are deterministic", () => {
  const ev = calculateRelicExpectedValues(standardRewards());
  const trace = calculateTraceEfficiency(ev);
  const best = selectBestRefinements(ev, trace);

  assert.equal(trace.Radiant.traceCost, 100);
  assert.equal(trace.Radiant.gain, 10.5);
  assert.equal(trace.Radiant.platinumPerTrace, 0.11);
  assert.equal(best.highestEV.refinement, "Radiant");
  assert.equal(best.bestTraceEfficiency.refinement, "Flawless");
});

test("reward mapping uses deterministic exact normalized matches", () => {
  const map = buildRewardMarketMap([
    { id: "1", item_name: "Titania Prime Systems Blueprint", url_name: "titania_prime_systems_blueprint" },
    { id: "2", item_name: "Forma", url_name: "forma" },
  ]);

  assert.equal(mapRewardToMarketItem("Titania Prime Systems Blueprint", map).marketUrlName, "titania_prime_systems_blueprint");
  assert.equal(mapRewardToMarketItem("Forma Blueprint", map).matchStatus, "non_tradable");
  assert.equal(mapRewardToMarketItem("Imaginary Prime Thing", map).matchStatus, "unmatched");
});

test("source rows group per relic and classify special/custom behavior", () => {
  const rows = [
    { tier: "Lith", relicName: "X1", state: "Intact", rewards: [{ itemName: "A", chance: 100 }] },
    { tier: "Lith", relicName: "X1", state: "Radiant", rewards: [{ itemName: "A", chance: 100 }] },
  ];
  const grouped = groupRelicSourceRows(rows);
  const model = classifyRelicProbabilityModel(grouped[0].rewards);

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].name, "Lith X1");
  assert.equal(model.model, "unsupported");
});
