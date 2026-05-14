import { queueFetch } from "./queue.js";
import { getDb } from "./db.js";

const BASE = "https://api.warframe.market/v2";

export async function syncItems() {
  console.log("Syncing item list from warframe.market...");
  try {
    const json = await queueFetch(`${BASE}/items`);
    const items = json.data;
    if (!Array.isArray(items)) throw new Error("Unexpected response: " + JSON.stringify(json).slice(0, 200));

    const db = getDb();
    const insert = db.prepare(
      "INSERT OR REPLACE INTO items (id, url_name, item_name, thumb) VALUES (@id, @url_name, @item_name, @thumb)"
    );
    const insertMany = db.transaction((rows) => {
      for (const item of rows) insert.run(item);
    });

    insertMany(items.map((i) => ({
      id:        i.id,
      url_name:  i.slug,
      item_name: i.i18n?.en?.name ?? i.slug,
      thumb:     i.thumb || null,
    })));

    console.log(`Synced ${items.length} items.`);
  } catch (err) {
    console.error("Failed to sync items:", err.message);
  }
}

// Fetch max_rank for an item from v2 API and cache in DB
async function ensureMaxRank(url_name) {
  const db = getDb();
  const row = db.prepare("SELECT max_rank FROM items WHERE url_name = ?").get(url_name);

  // Already cached
  if (row && row.max_rank !== null && row.max_rank !== undefined) return row.max_rank;

  try {
    const json = await queueFetch(`${BASE}/item/${url_name}`);
    const item = json.data;

    // max_rank lives at item.maxRank or item.i18n.en.maxRank depending on item type
    const maxRank = item?.maxRank ?? item?.i18n?.en?.maxRank ?? null;

    db.prepare("UPDATE items SET max_rank = ? WHERE url_name = ?").run(maxRank, url_name);
    return maxRank;
  } catch (_) {
    return null;
  }
}

export async function fetchPriceSnapshot(url_name, rank = null) {
  // Build URL with optional rank filter
  let url = `${BASE}/orders/item/${url_name}/top`;
  if (rank !== null) url += `?rank=${rank}`;

  const json = await queueFetch(url);
  const sells = json.data?.sell ?? [];

  if (sells.length === 0) return null;

  const prices = sells.map((o) => o.platinum).sort((a, b) => a - b);
  const min = prices[0];
  const max = prices[prices.length - 1];
  const avg = prices.reduce((s, p) => s + p, 0) / prices.length;

  const db = getDb();
  db.prepare(
    "INSERT INTO price_snapshots (url_name, rank, min_price, avg_price, max_price, volume) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(url_name, rank, min, Math.round(avg * 100) / 100, max, prices.length);

  // Lazily cache max_rank
  const maxRank = await ensureMaxRank(url_name);

  return { url_name, min, avg: Math.round(avg * 100) / 100, max, volume: prices.length, maxRank };
}