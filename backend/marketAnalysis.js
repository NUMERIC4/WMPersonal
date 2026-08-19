function numericPrices(orders) {
  return orders
    .map(o => o?.platinum)
    .filter(p => Number.isFinite(p))
    .sort((a, b) => a - b);
}

function round2(value) {
  return value === null || value === undefined ? null : Math.round(value * 100) / 100;
}

function roundPlat(value) {
  if (value === null || value === undefined) return null;
  return Number.isInteger(value) ? value : Math.round(value * 100) / 100;
}

export function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

export function removeIqrOutliers(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length < 4) return sorted;

  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;
  if (!Number.isFinite(iqr) || iqr === 0) return sorted;

  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return sorted.filter(value => value >= lower && value <= upper);
}

export function priceDistribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    q1: round2(percentile(sorted, 0.25)),
    median: round2(median(sorted)),
    q3: round2(percentile(sorted, 0.75)),
    max: sorted[sorted.length - 1] ?? null,
  };
}

export function bestNMedian(values, n = 5) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return roundPlat(median(sorted.slice(0, Math.max(1, n))));
}

export function detectSuspiciousLowListing(values) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length < 3) {
    return { suspicious: false, reason: "too_few_sellers", gap: null, excludedPrice: null };
  }
  const first = sorted[0];
  const second = sorted[1];
  const third = sorted[2];
  const gap = second - first;
  const reference = median(sorted.slice(1, Math.min(sorted.length, 6)));
  const isolatedFromSecond = gap >= Math.max(5, first * 0.5);
  const belowCluster = first < reference * 0.7;
  const suspicious = isolatedFromSecond && belowCluster;
  return {
    suspicious,
    reason: suspicious ? "first_listing_far_below_next_sellers" : "no_large_low_gap",
    gap,
    first,
    second,
    third,
    reference: roundPlat(reference),
    excludedPrice: suspicious ? first : null,
  };
}

function levelIndex(level) {
  return { VERY_LOW: 0, LOW: 1, MEDIUM: 2, HIGH: 3 }[level] ?? 0;
}

function capLevel(level, cap) {
  return levelIndex(level) <= levelIndex(cap) ? level : cap;
}

function classifyValuationConfidence(context) {
  const {
    activeSellerCount,
    activeBuyerCount,
    competitiveEstimate,
    competitiveRange,
    suspiciousLow,
    historical,
    freshness,
  } = context;
  const freshnessState = freshness?.state ?? freshness ?? "unknown";
  const reasons = [];
  let level = "HIGH";

  if (freshnessState === "fresh") reasons.push("stored order book is fresh");
  else if (freshnessState === "stale") {
    reasons.push("stored order book is stale");
    level = capLevel(level, "LOW");
  } else {
    reasons.push("freshness is unknown");
    level = capLevel(level, "MEDIUM");
  }

  if (activeSellerCount === 0) {
    reasons.push("no active sellers");
    level = "VERY_LOW";
  } else if (activeSellerCount === 1) {
    reasons.push("only 1 active seller");
    level = capLevel(level, "VERY_LOW");
  } else if (activeSellerCount === 2) {
    reasons.push("only 2 active sellers");
    level = capLevel(level, "LOW");
  } else if (activeSellerCount < 5) {
    reasons.push(`${activeSellerCount} active sellers`);
    level = capLevel(level, "MEDIUM");
  } else {
    reasons.push(`${activeSellerCount} active sellers`);
  }

  if (activeBuyerCount > 0) reasons.push(`${activeBuyerCount} active buyers`);
  else reasons.push("no active buyers");

  if (competitiveEstimate !== null && competitiveRange?.low !== null && competitiveRange?.high !== null) {
    const width = competitiveRange.high - competitiveRange.low;
    const dispersion = width / Math.max(1, competitiveEstimate);
    if (dispersion <= 0.1) reasons.push("competitive listings tightly clustered");
    else if (dispersion <= 0.25) {
      reasons.push("competitive listings moderately spread");
      level = capLevel(level, "MEDIUM");
    } else {
      reasons.push("competitive listings widely spread");
      level = capLevel(level, "LOW");
    }
  }

  if (suspiciousLow?.suspicious) {
    reasons.push("isolated low listing detected");
    level = capLevel(level, "MEDIUM");
  } else if (activeSellerCount >= 3) {
    reasons.push("no isolated low listing detected");
  }

  if (!historical?.available) {
    reasons.push(historical?.reason === "configuration_not_supported"
      ? "recent sales unavailable for this configuration"
      : "no recent closed-sale statistics");
    level = capLevel(level, "MEDIUM");
  } else {
    reasons.push(`${historical.volume} recent sales in ${historical.period}`);
    if (competitiveEstimate !== null && historical.median !== null && historical.median !== undefined) {
      const delta = Math.abs(competitiveEstimate - historical.median);
      const pct = delta / Math.max(1, historical.median);
      if (pct <= 0.1) reasons.push("competitive estimate agrees with recent sales");
      else if (pct <= 0.2) {
        reasons.push("competitive estimate is near recent sales");
        level = capLevel(level, "MEDIUM");
      } else {
        reasons.push("competitive estimate differs from recent sales");
        level = capLevel(level, "LOW");
      }
    }
  }

  return { level, label: level, reasons };
}

export function buildMarketValuation(orders = [], options = {}) {
  const groups = splitOrders(Array.isArray(orders) ? orders : [], options);
  const activeSellPrices = numericPrices(groups.onlineSellOrders);
  const activeBuyPrices = numericPrices(groups.onlineBuyOrders);
  const suspiciousLow = detectSuspiciousLowListing(activeSellPrices);
  const executableAsk = activeSellPrices[0] ?? null;
  const highestActiveBid = activeBuyPrices[activeBuyPrices.length - 1] ?? null;
  const competitiveSource = suspiciousLow.suspicious ? activeSellPrices.slice(1) : activeSellPrices;
  const competitiveSet = competitiveSource.slice(0, Math.min(5, competitiveSource.length));
  const competitiveEstimate = competitiveSet.length ? roundPlat(median(competitiveSet)) : null;
  const competitiveRange = {
    low: competitiveSet[0] ?? null,
    high: competitiveSet[competitiveSet.length - 1] ?? null,
  };
  const sellerMedian = roundPlat(median(activeSellPrices));
  const historical = options.historical
    ? { available: (options.historical.volume ?? 0) > 0, period: "48h", ...options.historical }
    : { available: false, period: "48h", median: null, average: null, volume: 0, reason: "not_provided" };
  const spread = executableAsk !== null && highestActiveBid !== null ? executableAsk - highestActiveBid : null;
  const confidence = classifyValuationConfidence({
    activeSellerCount: groups.onlineSellOrders.length,
    activeBuyerCount: groups.onlineBuyOrders.length,
    competitiveEstimate,
    competitiveRange,
    suspiciousLow,
    historical,
    freshness: options.freshness,
  });

  return {
    executableAsk,
    competitiveEstimate,
    competitiveRange,
    sellerMedian,
    historical,
    freshness: options.freshness ?? { state: "unknown" },
    highestActiveBid,
    spread,
    confidence,
    market: {
      activeSellers: groups.onlineSellOrders.length,
      activeBuyers: groups.onlineBuyOrders.length,
      ingameSellers: groups.ingameSellOrders.length,
      ingameBuyers: groups.ingameBuyOrders.length,
      offlineSellers: groups.offlineSellOrders.length,
      offlineBuyers: groups.offlineBuyOrders.length,
    },
    competitiveSet,
    suspiciousLow,
  };
}

function freshnessStateOf(value) {
  return value?.state ?? value ?? "unknown";
}

function usableCurrentFreshness(freshness, options = {}) {
  const state = freshnessStateOf(freshness);
  if (state === "fresh" || state === "aging") return true;
  return options.allowStale === true && state === "stale";
}

function valueResult(value, source, valuation, options = {}) {
  return {
    value,
    source,
    confidence: valuation?.confidence?.level ?? valuation?.confidence?.label ?? null,
    freshness: freshnessStateOf(options.freshness ?? valuation?.freshness),
    ageSeconds: options.freshness?.ageSeconds ?? null,
    reason: null,
  };
}

function unavailable(reason, options = {}) {
  return {
    value: null,
    source: null,
    confidence: null,
    freshness: freshnessStateOf(options.freshness),
    ageSeconds: options.freshness?.ageSeconds ?? null,
    reason,
  };
}

export function getMarketValue(valuation, purpose, options = {}) {
  const freshness = options.freshness ?? valuation?.freshness ?? { state: "fresh" };
  const currentUsable = usableCurrentFreshness(freshness, options);
  const legacy = options.legacy ?? null;

  if (!valuation && !legacy) return unavailable("no_valuation", { freshness });

  if (purpose === "acquire") {
    if (valuation?.executableAsk !== null && valuation?.executableAsk !== undefined && currentUsable) {
      return valueResult(valuation.executableAsk, "executableAsk", valuation, { freshness });
    }
    if (legacy?.min_price !== null && legacy?.min_price !== undefined) {
      return valueResult(legacy.min_price, "legacyMinSell", valuation, { freshness });
    }
    return unavailable(freshnessStateOf(freshness) === "stale" ? "stale_order_book" : "no_executable_ask", { freshness });
  }

  if (purpose === "fair" || purpose === "resale") {
    if (valuation?.competitiveEstimate !== null && valuation?.competitiveEstimate !== undefined && currentUsable) {
      return valueResult(valuation.competitiveEstimate, "competitiveEstimate", valuation, { freshness });
    }
    if (valuation?.historical?.available && valuation.historical.median !== null && valuation.historical.median !== undefined) {
      return valueResult(valuation.historical.median, "historicalMedian", valuation, { freshness });
    }
    if (legacy?.avg_price !== null && legacy?.avg_price !== undefined) {
      return valueResult(legacy.avg_price, "legacyAverage", valuation, { freshness });
    }
    return unavailable(freshnessStateOf(freshness) === "stale" ? "stale_order_book" : "no_fair_value", { freshness });
  }

  if (purpose === "liquidate") {
    if (valuation?.highestActiveBid !== null && valuation?.highestActiveBid !== undefined && currentUsable) {
      return valueResult(valuation.highestActiveBid, "highestActiveBid", valuation, { freshness });
    }
    return unavailable(freshnessStateOf(freshness) === "stale" ? "stale_order_book" : "no_active_bid", { freshness });
  }

  if (purpose === "historical") {
    if (valuation?.historical?.available && valuation.historical.median !== null && valuation.historical.median !== undefined) {
      return valueResult(valuation.historical.median, "historicalMedian", valuation, { freshness });
    }
    return unavailable(valuation?.historical?.reason ?? "no_matching_historical_data", { freshness });
  }

  return unavailable("unknown_purpose", { freshness });
}

export function classifyMarketConfidence(metrics, options = {}) {
  const historical = options.historical
    ? { available: (options.historical.volume ?? 0) > 0, ...options.historical }
    : { available: false, period: "48h", median: null, average: null, volume: 0, reason: "not_provided" };
  const valuation = {
    activeSellerCount: metrics.activeSellerCount ?? 0,
    activeBuyerCount: metrics.activeBuyerCount ?? 0,
    competitiveEstimate: metrics.competitiveEstimate ?? metrics.best5SellMedian ?? metrics.lowestOnlineSell ?? null,
    competitiveRange: metrics.competitiveRange ?? { low: metrics.lowestOnlineSell ?? null, high: metrics.best5SellMedian ?? metrics.lowestOnlineSell ?? null },
    suspiciousLow: metrics.lowListingCheck ?? metrics.suspiciousLow ?? null,
    historical,
    freshness: options.freshness,
  };
  const confidence = classifyValuationConfidence(valuation);
  return { ...confidence, score: levelIndex(confidence.level) };
}

function hasRank(order, rank) {
  return (order?.rank ?? null) === rank;
}

function statusOf(order) {
  return order?.user?.status ?? "unknown";
}

const MARKET_KEY_FIELDS = ["rank", "subtype", "charges", "amberStars", "cyanStars"];

function normalizeMarketKeyValue(value) {
  return value === undefined ? null : value;
}

export function marketKeyForOrder(order = {}, urlName = null) {
  const key = { url_name: urlName ?? order.url_name ?? null };
  for (const field of MARKET_KEY_FIELDS) key[field] = normalizeMarketKeyValue(order[field]);
  return key;
}

export function marketKeyId(key) {
  return JSON.stringify({
    v: 1,
    url_name: normalizeMarketKeyValue(key.url_name),
    rank: normalizeMarketKeyValue(key.rank),
    subtype: normalizeMarketKeyValue(key.subtype),
    charges: normalizeMarketKeyValue(key.charges),
    amberStars: normalizeMarketKeyValue(key.amberStars),
    cyanStars: normalizeMarketKeyValue(key.cyanStars),
  });
}

export function groupOrdersByMarketKey(orders = [], urlName = null) {
  const groups = new Map();
  for (const order of Array.isArray(orders) ? orders : []) {
    const key = marketKeyForOrder(order, urlName);
    const id = marketKeyId(key);
    if (!groups.has(id)) groups.set(id, { id, key, orders: [] });
    groups.get(id).orders.push(order);
  }
  return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function isOnlineLike(order) {
  const status = statusOf(order);
  return status === "ingame" || status === "online";
}

function countStatuses(orders) {
  return orders.reduce((counts, order) => {
    const status = statusOf(order);
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, { ingame: 0, online: 0, offline: 0, unknown: 0 });
}

function splitOrders(orders, options = {}) {
  const filtered = Object.hasOwn(options, "rank")
    ? orders.filter(order => hasRank(order, options.rank))
    : [...orders];

  const sellOrders = filtered.filter(order => order?.type === "sell");
  const buyOrders = filtered.filter(order => order?.type === "buy");

  return {
    all: filtered,
    sellOrders,
    buyOrders,
    ingameSellOrders: sellOrders.filter(order => statusOf(order) === "ingame"),
    onlineSellOrders: sellOrders.filter(isOnlineLike),
    offlineSellOrders: sellOrders.filter(order => !isOnlineLike(order)),
    ingameBuyOrders: buyOrders.filter(order => statusOf(order) === "ingame"),
    onlineBuyOrders: buyOrders.filter(isOnlineLike),
    offlineBuyOrders: buyOrders.filter(order => !isOnlineLike(order)),
  };
}

export function analyzeOrders(orders = [], options = {}) {
  const groups = splitOrders(Array.isArray(orders) ? orders : [], options);
  const sellPrices = numericPrices(groups.sellOrders);
  const buyPricesAsc = numericPrices(groups.buyOrders);
  const onlineSellPrices = numericPrices(groups.onlineSellOrders);
  const ingameSellPrices = numericPrices(groups.ingameSellOrders);
  const onlineBuyPricesAsc = numericPrices(groups.onlineBuyOrders);
  const ingameBuyPricesAsc = numericPrices(groups.ingameBuyOrders);
  const trimmedOnlineSellPrices = removeIqrOutliers(onlineSellPrices);
  const best5SellMedian = round2(bestNMedian(onlineSellPrices, options.bestN ?? 5));
  const lowListingCheck = detectSuspiciousLowListing(onlineSellPrices);

  const lowestOnlineSell = onlineSellPrices[0] ?? null;
  const highestOnlineBuy = onlineBuyPricesAsc[onlineBuyPricesAsc.length - 1] ?? null;
  const valuation = buildMarketValuation(groups.all, options);

  return {
    rank: Object.hasOwn(options, "rank") ? options.rank : null,
    orderCount: groups.all.length,
    sellOrderCount: groups.sellOrders.length,
    buyOrderCount: groups.buyOrders.length,
    sellerCount: groups.sellOrders.length,
    buyerCount: groups.buyOrders.length,
    statusCounts: countStatuses(groups.all),
    sellStatusCounts: countStatuses(groups.sellOrders),
    buyStatusCounts: countStatuses(groups.buyOrders),

    lowestSell: sellPrices[0] ?? null,
    lowestOnlineSell,
    lowestActiveSell: lowestOnlineSell,
    lowestIngameSell: ingameSellPrices[0] ?? null,
    highestBuy: buyPricesAsc[buyPricesAsc.length - 1] ?? null,
    highestOnlineBuy,
    highestActiveBuy: highestOnlineBuy,
    highestIngameBuy: ingameBuyPricesAsc[ingameBuyPricesAsc.length - 1] ?? null,
    medianSell: round2(median(sellPrices)),
    medianBuy: round2(median(buyPricesAsc)),
    medianOnlineSell: round2(median(onlineSellPrices)),
    medianActiveSell: round2(median(onlineSellPrices)),
    meanOnlineSell: round2(mean(onlineSellPrices)),
    trimmedOnlineSellMedian: round2(median(trimmedOnlineSellPrices)),
    trimmedActiveSellMedian: round2(median(trimmedOnlineSellPrices)),
    trimmedOnlineSellMean: round2(mean(trimmedOnlineSellPrices)),
    best5SellMedian: valuation.competitiveEstimate ?? best5SellMedian,
    lowListingCheck,
    spread: lowestOnlineSell !== null && highestOnlineBuy !== null ? lowestOnlineSell - highestOnlineBuy : null,
    valuation,
    executableAsk: valuation.executableAsk,
    competitiveEstimate: valuation.competitiveEstimate,
    competitiveRange: valuation.competitiveRange,
    sellerMedian: valuation.sellerMedian,
    historicalMedian: valuation.historical?.median ?? null,

    activeSellerCount: groups.onlineSellOrders.length,
    activeBuyerCount: groups.onlineBuyOrders.length,
    ingameSellerCount: groups.ingameSellOrders.length,
    ingameBuyerCount: groups.ingameBuyOrders.length,
    offlineSellerCount: groups.offlineSellOrders.length,
    offlineBuyerCount: groups.offlineBuyOrders.length,
    priceDistribution: {
      sell: priceDistribution(sellPrices),
      onlineSell: priceDistribution(onlineSellPrices),
      buy: priceDistribution(buyPricesAsc),
      onlineBuy: priceDistribution(onlineBuyPricesAsc),
    },
    fairPriceCandidates: {
      medianOnlineSell: round2(median(onlineSellPrices)),
      trimmedSellEstimate: round2(median(trimmedOnlineSellPrices)),
      bestExecutableSell: lowestOnlineSell,
      best5SellMedian: valuation.competitiveEstimate ?? best5SellMedian,
      competitiveEstimate: valuation.competitiveEstimate,
    },
    confidence: valuation.confidence,
  };
}

export function analyzeOrdersByMarketKey(orders = [], urlName = null, options = {}) {
  return groupOrdersByMarketKey(orders, urlName).map(group => ({
    marketKeyId: group.id,
    marketKey: group.key,
    ...analyzeOrders(group.orders, options),
  }));
}

export function platPerKStanding(value, standingCost) {
  if (value === null || value === undefined || !standingCost) return null;
  return Math.round((value * 1000 / standingCost) * 100) / 100;
}

export function buildProfitProfile(url_name, item_name, rank, maxRank, standingCost, orders, stats90) {
  const groups = splitOrders(Array.isArray(orders) ? orders : [], { rank });
  const nonIngameSellPrices = numericPrices(groups.sellOrders.filter(order => statusOf(order) !== "ingame"));

  const totalVol90 = stats90.reduce((sum, row) => sum + (row.volume ?? 0), 0);
  const avgDaily = stats90.length ? totalVol90 / stats90.length : 0;
  const medians = stats90.map(row => row.median).filter(Boolean);
  const avgMedian = medians.length ? medians.reduce((sum, value) => sum + value, 0) / medians.length : null;
  const historical = {
    available: totalVol90 > 0 && avgMedian !== null,
    median: avgMedian ? Math.round(avgMedian * 10) / 10 : null,
    average: null,
    volume: totalVol90,
    period: "90d",
    reason: totalVol90 > 0 && avgMedian !== null ? null : "no_recent_statistics",
  };
  const valuation = buildMarketValuation(groups.all, { freshness: { state: "fresh" }, historical });
  const acquisition = getMarketValue(valuation, "acquire", { freshness: { state: "fresh" } });
  const liquidation = getMarketValue(valuation, "liquidate", { freshness: { state: "fresh" } });
  const resale = getMarketValue(valuation, "resale", { freshness: { state: "fresh" } });

  const minSell = acquisition.value;
  const maxBuy = liquidation.value;
  const margin = minSell !== null && maxBuy !== null ? minSell - maxBuy : null;
  const sellSpeed = Math.round(avgDaily * 10) / 10;
  const score = margin !== null && sellSpeed > 0 ? Math.round(margin * sellSpeed) : 0;

  return {
    url_name, item_name, rank, maxRank,
    standingCost,
    minSell, maxBuy, margin,
    acquisitionValue: acquisition.value,
    expectedResaleValue: resale.value,
    liquidationValue: liquidation.value,
    valuationSources: {
      acquisition,
      resale,
      liquidation,
    },
    valuationConfidence: valuation.confidence?.level ?? null,
    minSellPerKStanding: platPerKStanding(minSell, standingCost),
    avgMedianPerKStanding: platPerKStanding(avgMedian, standingCost),
    marginPerKStanding: platPerKStanding(margin, standingCost),
    offlineMinSell: nonIngameSellPrices[0] ?? null,
    onlineSellers: valuation.market.activeSellers,
    onlineBuyers: valuation.market.activeBuyers,
    offlineSellers: nonIngameSellPrices.length,
    vol90d: totalVol90,
    avgDaily90d: sellSpeed,
    avgMedian90d: avgMedian ? Math.round(avgMedian * 10) / 10 : null,
    score,
  };
}
