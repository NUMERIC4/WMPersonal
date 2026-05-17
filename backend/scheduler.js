import { getDb } from "./db.js";
import { fetchPriceSnapshot } from "./sync.js";
import { fetchUserOrders } from "./userFetch.js";

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

  function extractErrorMessage(e) {
    if (!e) return "Unknown error";
    if (e.body && typeof e.body === "object") {
      const requestErrors = e.body.error?.request;
      if (Array.isArray(requestErrors) && requestErrors.includes("app.user.notFound")) {
        return "User not found";
      }
      return JSON.stringify(e.body);
    }
    return e.message || String(e);
  }

  for (const { slug } of favs) {
    const canonical = (slug || "").trim().toLowerCase();
    try {
      const json = await fetchUserOrders(canonical);
      const orders = (json && json.data) ? json.data : [];

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
          console.warn(`  Failed snapshot for ${itemSlug}: ${extractErrorMessage(e)}`);
        }
      }

      console.log(`  ${canonical}: ${orders.length} orders, ${fetched} snapshots saved.`);
      results.push({ slug: canonical, orders: orders.length, snapshots: fetched });
    } catch (e) {
      const message = extractErrorMessage(e);
      console.error(`  Failed to refresh ${canonical}: ${message}`);
      results.push({ slug: canonical, error: message });
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