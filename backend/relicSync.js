import { fetch } from "undici";
import { getDb } from "./db.js";
import { classifyRelicProbabilityModel, inferRarityFromChances, REFINEMENTS } from "./relicAnalysis.js";

const RELICS_URL = "https://drops.warframestat.us/data/relics.json";
const INFO_URL = "https://drops.warframestat.us/data/info.json";
const SOURCE_NAME = "WFCD warframe-drop-data from Digital Extremes official drop tables";

function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function relicName(era, code) {
  return `${era} ${code}`;
}

function isNonTradableReward(name) {
  const normalized = normalizeName(name);
  return normalized === "forma_blueprint" || normalized === "forma";
}

export function buildRewardMarketMap(items) {
  const byName = new Map();
  const bySlug = new Map();
  for (const item of items) {
    const nameKey = normalizeName(item.item_name);
    const slugKey = normalizeName(item.url_name);
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    byName.get(nameKey).push(item);
    if (!bySlug.has(slugKey)) bySlug.set(slugKey, []);
    bySlug.get(slugKey).push(item);
  }
  return { byName, bySlug };
}

export function mapRewardToMarketItem(rewardName, marketMap) {
  if (isNonTradableReward(rewardName)) {
    return { marketUrlName: null, itemName: rewardName, matchStatus: "non_tradable", isTradable: false };
  }

  const key = normalizeName(rewardName);
  const candidates = marketMap.byName.get(key) ?? marketMap.bySlug.get(key) ?? [];
  if (candidates.length === 1) {
    return {
      marketUrlName: candidates[0].url_name,
      itemName: candidates[0].item_name,
      matchStatus: "matched",
      isTradable: true,
    };
  }
  if (candidates.length > 1) {
    return { marketUrlName: null, itemName: rewardName, matchStatus: "ambiguous", isTradable: true };
  }
  return { marketUrlName: null, itemName: rewardName, matchStatus: "unmatched", isTradable: true };
}

export function groupRelicSourceRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const era = row.tier;
    const code = row.relicName;
    if (!era || !code) continue;
    const key = `${era}:${code}`;
    if (!groups.has(key)) groups.set(key, { era, code, name: relicName(era, code), states: {}, rewards: new Map(), sourceIds: new Set() });
    const group = groups.get(key);
    group.states[row.state] = true;
    if (row._id) group.sourceIds.add(row._id);
    for (const reward of row.rewards ?? []) {
      if (!group.rewards.has(reward.itemName)) {
        group.rewards.set(reward.itemName, { rewardName: reward.itemName, sourceRarity: reward.rarity ?? null, chances: {} });
      }
      group.rewards.get(reward.itemName).chances[row.state] = reward.chance;
    }
  }

  return [...groups.values()].map(group => ({
    ...group,
    rewards: [...group.rewards.values()].map(reward => ({
      ...reward,
      rarity: inferRarityFromChances(reward.chances),
    })),
    sourceId: [...group.sourceIds].sort().join(","),
  }));
}

async function fetchRelicSource() {
  const [relicRes, infoRes] = await Promise.all([fetch(RELICS_URL), fetch(INFO_URL).catch(() => null)]);
  if (!relicRes.ok) throw new Error(`Relic data HTTP ${relicRes.status}`);
  const relicJson = await relicRes.json();
  const infoJson = infoRes?.ok ? await infoRes.json() : {};
  const rows = relicJson.relics;
  if (!Array.isArray(rows)) throw new Error("Malformed relic feed: relics must be an array");
  return { rows, info: infoJson };
}

export async function syncRelics(options = {}) {
  const db = options.db ?? getDb();
  const source = options.source ?? await fetchRelicSource();
  const groups = groupRelicSourceRows(source.rows);
  const marketItems = db.prepare("SELECT id, url_name, item_name FROM items").all();
  const marketMap = buildRewardMarketMap(marketItems);
  const sourceUpdatedAt = source.info?.modified ? new Date(source.info.modified).toISOString() : new Date().toISOString();

  const upsertRelic = db.prepare(
    "INSERT INTO relics (name, era, code, status, probability_model, probability_model_reason, source, source_id, source_updated_at, is_supported) " +
    "VALUES (@name, @era, @code, @status, @probability_model, @probability_model_reason, @source, @source_id, @source_updated_at, @is_supported) " +
    "ON CONFLICT(name) DO UPDATE SET era=excluded.era, code=excluded.code, status=excluded.status, " +
    "probability_model=excluded.probability_model, probability_model_reason=excluded.probability_model_reason, " +
    "source=excluded.source, source_id=excluded.source_id, source_updated_at=excluded.source_updated_at, is_supported=excluded.is_supported"
  );
  const deleteRewards = db.prepare("DELETE FROM relic_rewards WHERE relic_id = ?");
  const insertReward = db.prepare(
    "INSERT INTO relic_rewards (" +
    "relic_id, reward_name, market_url_name, item_name, rarity, source_rarity, match_status, is_tradable, " +
    "chance_intact, chance_exceptional, chance_flawless, chance_radiant" +
    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const findRelic = db.prepare("SELECT id FROM relics WHERE name = ?");

  const stats = {
    relics: 0,
    rewards: 0,
    matched: 0,
    ambiguous: 0,
    unmatched: 0,
    nonTradable: 0,
    standard: 0,
    custom: 0,
    unsupported: 0,
  };

  const tx = db.transaction(() => {
    for (const group of groups) {
      const model = classifyRelicProbabilityModel(group.rewards);
      const supported = model.model !== "unsupported";
      upsertRelic.run({
        name: group.name,
        era: group.era,
        code: group.code,
        status: "unknown",
        probability_model: model.model,
        probability_model_reason: model.reason,
        source: SOURCE_NAME,
        source_id: group.sourceId,
        source_updated_at: sourceUpdatedAt,
        is_supported: supported ? 1 : 0,
      });
      const relicId = findRelic.get(group.name).id;
      deleteRewards.run(relicId);
      stats.relics++;
      stats[model.model]++;

      for (const reward of group.rewards) {
        const mapping = mapRewardToMarketItem(reward.rewardName, marketMap);
        insertReward.run(
          relicId,
          reward.rewardName,
          mapping.marketUrlName,
          mapping.itemName,
          reward.rarity,
          reward.sourceRarity,
          mapping.matchStatus,
          mapping.isTradable ? 1 : 0,
          reward.chances.Intact ?? null,
          reward.chances.Exceptional ?? null,
          reward.chances.Flawless ?? null,
          reward.chances.Radiant ?? null,
        );
        stats.rewards++;
        if (mapping.matchStatus === "matched") stats.matched++;
        else if (mapping.matchStatus === "ambiguous") stats.ambiguous++;
        else if (mapping.matchStatus === "unmatched") stats.unmatched++;
        else if (mapping.matchStatus === "non_tradable") stats.nonTradable++;
      }
    }
  });

  tx();

  return {
    ...stats,
    source: SOURCE_NAME,
    sourceUpdatedAt,
    refinements: REFINEMENTS,
  };
}
