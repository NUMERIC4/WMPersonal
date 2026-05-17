import { queueFetch } from "./queue.js";

// Try several user slug normalizations to handle spaces/casing/hyphens
export async function fetchUserOrders(slug) {
  const s = (slug || "").trim();
  const lower = s.toLowerCase();
  const variants = [
    lower,
    s,
    s.replace(/\s+/g, ""),
    s.replace(/\s+/g, "-").toLowerCase(),
    s.replace(/\s+/g, "_").toLowerCase(),
  ];

  let lastErr = null;
  for (const v of variants) {
    const encoded = encodeURIComponent(v);
    const url = `https://api.warframe.market/v2/orders/user/${encoded}`;
    try {
      const json = await queueFetch(url);
      return json;
    } catch (e) {
      lastErr = e;
      console.warn(`fetchUserOrders: attempt failed for variant '${v}' -> ${e.message}`);
    }
  }

  // All attempts failed; throw the last error to keep existing error handling
  throw lastErr || new Error("fetchUserOrders: no variants to try");
}

export default fetchUserOrders;
