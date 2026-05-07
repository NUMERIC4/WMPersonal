import { queueFetch } from "./queue.js";
import { getDb } from "./db.js";

const BASE = "https://api.warframe.market/v2";

export async function syncItems() {
  console.log("Syncing item list from warframe.market...");
  try {
    const json = await queueFetch(`${BASE}/items`);

    // v2 response: { data: [...], error: null }
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
      url_name:  i.slug,        // v2 uses "slug" instead of "url_name"
      item_name: i.i18n?.en?.name ?? i.slug,
      thumb:     i.thumb || null,
    })));

    console.log(`Synced ${items.length} items.`);
  } catch (err) {
    console.error("Failed to sync items:", err.message);
  }
}

export async function fetchPriceSnapshot(url_name) {
  // v2 orders endpoint: /v2/orders/item/{slug}/top  (top 5 online buyers/sellers)
  const json = await queueFetch(`https://api.warframe.market/v2/orders/item/${url_name}/top`);

  // response: { data: { buy: [...], sell: [...] }, error: null }
  const sells = json.data?.sell ?? [];

  if (sells.length === 0) return null;

  const prices = sells.map((o) => o.platinum).sort((a, b) => a - b);
  const min = prices[0];
  const max = prices[prices.length - 1];
  const avg = prices.reduce((s, p) => s + p, 0) / prices.length;

  const db = getDb();
  db.prepare(
    "INSERT INTO price_snapshots (url_name, min_price, avg_price, max_price, volume) VALUES (?, ?, ?, ?, ?)"
  ).run(url_name, min, Math.round(avg * 100) / 100, max, prices.length);

  return { url_name, min, avg: Math.round(avg * 100) / 100, max, volume: prices.length };
}