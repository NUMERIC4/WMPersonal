import { getDb } from "./db.js";
import { queueFetch } from "./queue.js";
import { fetchPriceSnapshot } from "./sync.js";

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let running = false;

export async function refreshFavourites() {
  if (running) {
    console.log("Refresh already in progress, skipping.");
    return { skipped: true };
  }
  running = true;
  console.log("Refreshing favourite users...");

  const db = getDb();
  const favs = db.prepare("SELECT slug FROM favourite_users").all();
  const results = [];

  for (const { slug } of favs) {
    try {
      const json = await queueFetch(`https://api.warframe.market/v2/orders/user/${slug}`);
      const orders = json.data ?? [];

      // Fetch price snapshot for each unique item slug
      const slugs = [...new Set(
        orders.map(o => {
          const row = db.prepare("SELECT url_name FROM items WHERE id = ?").get(o.itemId ?? "");
          return row?.url_name ?? null;
        }).filter(Boolean)
      )];

      let fetched = 0;
      for (const itemSlug of slugs) {
        try {
          await fetchPriceSnapshot(itemSlug);
          fetched++;
        } catch (e) {
          console.warn(`  Failed snapshot for ${itemSlug}: ${e.message}`);
        }
      }

      console.log(`  ${slug}: ${orders.length} orders, ${fetched} snapshots saved.`);
      results.push({ slug, orders: orders.length, snapshots: fetched });
    } catch (e) {
      console.error(`  Failed to refresh ${slug}: ${e.message}`);
      results.push({ slug, error: e.message });
    }
  }

  running = false;
  console.log("Favourite refresh complete.");
  return results;
}

export function startScheduler() {
  // Run once on startup after a short delay
  setTimeout(() => refreshFavourites(), 5000);
  // Then every 5 minutes
  setInterval(() => refreshFavourites(), INTERVAL_MS);
  console.log("Scheduler started (5 min interval).");
}