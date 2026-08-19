import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeOrders,
  analyzeOrdersByMarketKey,
  bestNMedian,
  buildMarketValuation,
  buildProfitProfile,
  classifyMarketConfidence,
  detectSuspiciousLowListing,
  getMarketValue,
  marketKeyForOrder,
  marketKeyId,
  mean,
  median,
  removeIqrOutliers,
} from "../backend/marketAnalysis.js";

function order({ type = "sell", platinum, status = "ingame", rank = null, id = String(Math.random()) }) {
  return {
    id,
    type,
    platinum,
    quantity: 1,
    rank,
    user: { id: `user-${id}`, slug: `user-${id}`, status },
  };
}

test("analyzeOrders handles no orders", () => {
  const summary = analyzeOrders([]);
  assert.equal(summary.orderCount, 0);
  assert.equal(summary.lowestSell, null);
  assert.equal(summary.highestBuy, null);
  assert.equal(summary.medianOnlineSell, null);
  assert.equal(summary.spread, null);
});

test("analyzeOrders handles only sell orders", () => {
  const summary = analyzeOrders([
    order({ platinum: 10, status: "online" }),
    order({ platinum: 12, status: "ingame" }),
  ]);

  assert.equal(summary.lowestSell, 10);
  assert.equal(summary.lowestOnlineSell, 10);
  assert.equal(summary.lowestIngameSell, 12);
  assert.equal(summary.highestBuy, null);
  assert.equal(summary.sellerCount, 2);
  assert.equal(summary.buyerCount, 0);
});

test("analyzeOrders handles only buy orders", () => {
  const summary = analyzeOrders([
    order({ type: "buy", platinum: 8, status: "online" }),
    order({ type: "buy", platinum: 11, status: "ingame" }),
  ]);

  assert.equal(summary.lowestSell, null);
  assert.equal(summary.highestBuy, 11);
  assert.equal(summary.highestOnlineBuy, 11);
  assert.equal(summary.highestIngameBuy, 11);
  assert.equal(summary.sellerCount, 0);
  assert.equal(summary.buyerCount, 2);
});

test("analyzeOrders handles one order", () => {
  const summary = analyzeOrders([order({ platinum: 42, status: "online" })]);

  assert.equal(summary.lowestOnlineSell, 42);
  assert.equal(summary.medianOnlineSell, 42);
  assert.equal(summary.meanOnlineSell, 42);
  assert.equal(summary.trimmedOnlineSellMedian, 42);
});

test("offline-only orders do not count as online executable orders", () => {
  const summary = analyzeOrders([
    order({ platinum: 3, status: "offline" }),
    order({ type: "buy", platinum: 2, status: "offline" }),
  ]);

  assert.equal(summary.lowestSell, 3);
  assert.equal(summary.lowestOnlineSell, null);
  assert.equal(summary.highestOnlineBuy, null);
  assert.equal(summary.offlineSellerCount, 1);
  assert.equal(summary.activeSellerCount, 0);
});

test("mixed statuses are separated into online-like and ingame metrics", () => {
  const summary = analyzeOrders([
    order({ platinum: 9, status: "offline" }),
    order({ platinum: 7, status: "online" }),
    order({ platinum: 8, status: "ingame" }),
    order({ type: "buy", platinum: 4, status: "online" }),
    order({ type: "buy", platinum: 5, status: "ingame" }),
  ]);

  assert.equal(summary.lowestSell, 7);
  assert.equal(summary.lowestOnlineSell, 7);
  assert.equal(summary.lowestIngameSell, 8);
  assert.equal(summary.highestOnlineBuy, 5);
  assert.equal(summary.highestIngameBuy, 5);
  assert.equal(summary.spread, 2);
  assert.deepEqual(summary.statusCounts, { ingame: 2, online: 2, offline: 1, unknown: 0 });
});

test("outlier-resistant estimate is not dragged by extreme sell prices", () => {
  const prices = [3, 4, 4, 5, 5, 6, 6, 7, 20, 100];
  const summary = analyzeOrders(prices.map((platinum, index) => order({ platinum, status: "online", id: String(index) })));

  assert.equal(median(prices), 5.5);
  assert.equal(Math.round(mean(prices) * 10) / 10, 16);
  assert.deepEqual(removeIqrOutliers(prices), [3, 4, 4, 5, 5, 6, 6, 7]);
  assert.equal(summary.medianOnlineSell, 5.5);
  assert.equal(summary.meanOnlineSell, 16);
  assert.equal(summary.trimmedOnlineSellMedian, 5);
  assert.equal(summary.fairPriceCandidates.trimmedSellEstimate, 5);
});

test("best-N median follows the competitive lower sell edge", () => {
  assert.equal(bestNMedian([10, 11, 11, 12, 13, 15, 40, 100], 5), 11);
});

test("market valuation handles a healthy competitive cluster", () => {
  const valuation = buildMarketValuation([40, 41, 41, 42, 43, 80, 100, 200].map((platinum, index) => (
    order({ platinum, status: "online", id: `healthy-${index}` })
  )), {
    freshness: { state: "fresh" },
    historical: { available: true, median: 41, average: 42.1, volume: 182, period: "48h" },
  });

  assert.equal(valuation.executableAsk, 40);
  assert.equal(valuation.competitiveEstimate, 41);
  assert.deepEqual(valuation.competitiveRange, { low: 40, high: 43 });
  assert.equal(valuation.sellerMedian, 42.5);
  assert.equal(valuation.confidence.level, "HIGH");
});

test("one suspicious low listing is detected", () => {
  const check = detectSuspiciousLowListing([10, 50, 51, 52, 53]);
  assert.equal(check.suspicious, true);
});

test("isolated cheap listing remains executable ask but is excluded from fair estimate", () => {
  const valuation = buildMarketValuation([10, 50, 51, 52, 53].map((platinum, index) => (
    order({ platinum, status: "online", id: `isolated-${index}` })
  )), {
    freshness: { state: "fresh" },
    historical: { available: true, median: 51, average: 51, volume: 20, period: "48h" },
  });

  assert.equal(valuation.executableAsk, 10);
  assert.equal(valuation.competitiveEstimate, 51.5);
  assert.deepEqual(valuation.competitiveRange, { low: 50, high: 53 });
  assert.equal(valuation.suspiciousLow.suspicious, true);
  assert.ok(valuation.confidence.reasons.includes("isolated low listing detected"));
});

test("two cheap listings are treated as a visible low cluster", () => {
  const valuation = buildMarketValuation([10, 11, 50, 51, 52].map((platinum, index) => (
    order({ platinum, status: "online", id: `two-low-${index}` })
  )));

  assert.equal(valuation.suspiciousLow.suspicious, false);
  assert.equal(valuation.executableAsk, 10);
  assert.equal(valuation.competitiveEstimate, 50);
  assert.deepEqual(valuation.competitiveRange, { low: 10, high: 52 });
});

test("clustered low listings are not suspicious", () => {
  const check = detectSuspiciousLowListing([40, 41, 41, 42, 43, 70]);
  assert.equal(check.suspicious, false);
});

test("high-price tail does not move best-5 median", () => {
  const summary = analyzeOrders([7, 8, 8, 9, 10, 100, 150, 200, 250, 300, 400].map((platinum, index) => (
    order({ platinum, status: "online", id: `tail-${index}` })
  )));

  assert.equal(summary.medianActiveSell, 100);
  assert.equal(summary.best5SellMedian, 8);
});

test("valuation handles one seller, two sellers, no sellers, and no buyers", () => {
  const none = buildMarketValuation([]);
  const one = buildMarketValuation([order({ platinum: 25, status: "online" })]);
  const two = buildMarketValuation([
    order({ platinum: 25, status: "online", id: "two-a" }),
    order({ platinum: 27, status: "online", id: "two-b" }),
  ]);
  const noBuyers = buildMarketValuation([40, 41, 42, 43, 44].map((platinum, index) => (
    order({ platinum, status: "online", id: `no-buyer-${index}` })
  )));

  assert.equal(none.competitiveEstimate, null);
  assert.equal(none.confidence.level, "VERY_LOW");
  assert.equal(one.competitiveEstimate, 25);
  assert.equal(one.confidence.level, "VERY_LOW");
  assert.equal(two.competitiveEstimate, 26);
  assert.equal(two.confidence.level, "LOW");
  assert.equal(noBuyers.highestActiveBid, null);
  assert.equal(noBuyers.spread, null);
});

test("historical agreement and disagreement affect confidence reasons", () => {
  const orders = [40, 41, 41, 42, 43, 44, 45, 46].map((platinum, index) => (
    order({ platinum, status: "online", id: `hist-${index}` })
  ));
  const agrees = buildMarketValuation(orders, {
    freshness: { state: "fresh" },
    historical: { available: true, median: 41, average: 42, volume: 50, period: "48h" },
  });
  const disagrees = buildMarketValuation(orders, {
    freshness: { state: "fresh" },
    historical: { available: true, median: 100, average: 100, volume: 50, period: "48h" },
  });

  assert.ok(agrees.confidence.reasons.includes("competitive estimate agrees with recent sales"));
  assert.ok(disagrees.confidence.reasons.includes("competitive estimate differs from recent sales"));
  assert.equal(disagrees.confidence.level, "LOW");
});

test("no historical data and stale data lower confidence explainably", () => {
  const orders = [40, 41, 41, 42, 43, 44, 45, 46].map((platinum, index) => (
    order({ platinum, status: "online", id: `stale-${index}` })
  ));
  const noHistory = buildMarketValuation(orders, { freshness: { state: "fresh" } });
  const stale = buildMarketValuation(orders, {
    freshness: { state: "stale" },
    historical: { available: true, median: 41, average: 42, volume: 50, period: "48h" },
  });

  assert.ok(noHistory.confidence.reasons.includes("no recent closed-sale statistics"));
  assert.notEqual(noHistory.confidence.level, "HIGH");
  assert.ok(stale.confidence.reasons.includes("stored order book is stale"));
  assert.equal(stale.confidence.level, "LOW");
});

test("market value selector maps semantic purposes to valuation fields", () => {
  const valuation = {
    executableAsk: 40,
    competitiveEstimate: 42,
    highestActiveBid: 37,
    historical: { available: true, median: 41, volume: 20, period: "48h" },
    confidence: { level: "HIGH" },
  };
  const freshness = { state: "fresh", ageSeconds: 12 };

  assert.deepEqual(getMarketValue(valuation, "acquire", { freshness }).source, "executableAsk");
  assert.deepEqual(getMarketValue(valuation, "fair", { freshness }).source, "competitiveEstimate");
  assert.deepEqual(getMarketValue(valuation, "resale", { freshness }).source, "competitiveEstimate");
  assert.deepEqual(getMarketValue(valuation, "liquidate", { freshness }).source, "highestActiveBid");
  assert.deepEqual(getMarketValue(valuation, "historical", { freshness }).source, "historicalMedian");
});

test("market value selector reports fallback and stale unavailable sources", () => {
  const stale = getMarketValue(
    { executableAsk: 10, competitiveEstimate: 12, confidence: { level: "LOW" } },
    "acquire",
    { freshness: { state: "stale" } }
  );
  const neverSynced = getMarketValue(null, "fair", { freshness: { state: "never_synced" }, legacy: { avg_price: 33 } });
  const fairFallback = getMarketValue(
    { competitiveEstimate: null, historical: { available: true, median: 20, volume: 5, period: "48h" }, confidence: { level: "LOW" } },
    "fair",
    { freshness: { state: "fresh" } }
  );

  assert.equal(stale.value, null);
  assert.equal(stale.reason, "stale_order_book");
  assert.equal(neverSynced.source, "legacyAverage");
  assert.equal(fairFallback.source, "historicalMedian");
});

test("no sellers and only one seller produce low confidence", () => {
  const none = analyzeOrders([]);
  const one = analyzeOrders([order({ platinum: 200, status: "online" })]);

  assert.equal(none.confidence.label, "VERY_LOW");
  assert.ok(["VERY_LOW", "LOW"].includes(one.confidence.label));
});

test("confidence improves with clustered sellers and volume", () => {
  const summary = analyzeOrders([40, 41, 41, 42, 43, 44, 44, 45].map((platinum, index) => (
    order({ platinum, status: "online", id: `cluster-${index}` })
  )), { freshness: { state: "fresh" }, historical: { volume: 30 } });

  assert.equal(summary.confidence.label, "HIGH");
});

test("stale data weakens confidence", () => {
  const confidence = classifyMarketConfidence({
    activeSellerCount: 8,
    activeBuyerCount: 3,
    lowestOnlineSell: 40,
    spread: 2,
    lowListingCheck: { suspicious: false },
  }, { freshness: { state: "stale" }, historical: { volume: 30 } });

  assert.notEqual(confidence.label, "HIGH");
});

test("quantity does not weight experimental price metrics yet", () => {
  const summary = analyzeOrders([
    { ...order({ platinum: 10, status: "online", id: "bulk" }), quantity: 50 },
    { ...order({ platinum: 11, status: "online", id: "single1" }), quantity: 1 },
    { ...order({ platinum: 12, status: "online", id: "single2" }), quantity: 1 },
  ]);

  assert.equal(summary.best5SellMedian, 11);
  assert.equal(summary.medianActiveSell, 11);
});

test("rank-specific analysis ignores other ranks", () => {
  const orders = [
    order({ platinum: 20, status: "online", rank: 0 }),
    order({ platinum: 8, status: "online", rank: 5 }),
    order({ type: "buy", platinum: 6, status: "ingame", rank: 5 }),
  ];
  const summary = analyzeOrders(orders, { rank: 5 });

  assert.equal(summary.orderCount, 2);
  assert.equal(summary.lowestOnlineSell, 8);
  assert.equal(summary.highestOnlineBuy, 6);
  assert.equal(summary.spread, 2);
});

test("market keys separate economically different configurations", () => {
  const rank0 = order({ platinum: 7, status: "ingame", rank: 0 });
  const rank5 = order({ type: "buy", platinum: 51, status: "ingame", rank: 5 });
  const subtype = { ...order({ platinum: 5, status: "online", rank: null }), subtype: "radiant" };
  const starred = { ...order({ platinum: 6, status: "online", rank: null }), amberStars: 1, cyanStars: 3 };

  assert.equal(
    marketKeyId(marketKeyForOrder(rank0, "magus_destruct")),
    JSON.stringify({ v: 1, url_name: "magus_destruct", rank: 0, subtype: null, charges: null, amberStars: null, cyanStars: null })
  );
  const groups = analyzeOrdersByMarketKey([rank0, rank5, subtype, starred], "mixed_item");

  assert.equal(groups.length, 4);
  assert.deepEqual(groups.map(group => group.orderCount), [1, 1, 1, 1]);
});

test("market-key grouped analysis avoids crossed spread across ranks", () => {
  const groups = analyzeOrdersByMarketKey([
    order({ platinum: 7, status: "ingame", rank: 0 }),
    order({ type: "buy", platinum: 51, status: "ingame", rank: 5 }),
    order({ platinum: 120, status: "ingame", rank: 5 }),
  ], "magus_destruct");

  const rank0 = groups.find(group => group.marketKey.rank === 0);
  const rank5 = groups.find(group => group.marketKey.rank === 5);

  assert.equal(rank0.lowestOnlineSell, 7);
  assert.equal(rank0.highestOnlineBuy, null);
  assert.equal(rank0.spread, null);
  assert.equal(rank5.lowestOnlineSell, 120);
  assert.equal(rank5.highestOnlineBuy, 51);
  assert.equal(rank5.spread, 69);
  assert.equal(rank0.valuation.spread, null);
  assert.equal(rank5.valuation.spread, 69);
});

test("duplicate prices preserve correct median", () => {
  const summary = analyzeOrders([4, 4, 4, 5, 5, 6].map((platinum, index) => (
    order({ platinum, status: "online", id: String(index) })
  )));

  assert.equal(summary.medianOnlineSell, 4.5);
  assert.equal(summary.priceDistribution.onlineSell.count, 6);
});

test("buildProfitProfile preserves existing profit semantics", () => {
  const profile = buildProfitProfile(
    "test_item",
    "Test Item",
    null,
    null,
    25000,
    [
      order({ platinum: 9, status: "offline" }),
      order({ platinum: 12, status: "ingame" }),
      order({ type: "buy", platinum: 8, status: "ingame" }),
    ],
    [{ volume: 10, median: 11 }, { volume: 20, median: 13 }],
  );

  assert.equal(profile.minSell, 12);
  assert.equal(profile.maxBuy, 8);
  assert.equal(profile.margin, 4);
  assert.equal(profile.valuationSources.acquisition.source, "executableAsk");
  assert.equal(profile.valuationSources.liquidation.source, "highestActiveBid");
  assert.equal(profile.valuationSources.resale.source, "competitiveEstimate");
  assert.equal(profile.offlineMinSell, 9);
  assert.equal(profile.onlineSellers, 1);
  assert.equal(profile.onlineBuyers, 1);
  assert.equal(profile.offlineSellers, 1);
  assert.equal(profile.vol90d, 30);
  assert.equal(profile.avgMedian90d, 12);
  assert.equal(profile.minSellPerKStanding, 0.48);
});

test("buildProfitProfile keeps old non-ingame fallback semantics", () => {
  const profile = buildProfitProfile(
    "test_item",
    "Test Item",
    null,
    null,
    null,
    [
      order({ platinum: 11, status: "offline" }),
      order({ platinum: 9, status: "online" }),
      order({ type: "buy", platinum: 6, status: "ingame" }),
    ],
    [],
  );

  assert.equal(profile.minSell, 9);
  assert.equal(profile.offlineMinSell, 9);
  assert.equal(profile.onlineSellers, 1);
  assert.equal(profile.offlineSellers, 2);
});
