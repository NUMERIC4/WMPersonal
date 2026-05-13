import "dotenv/config";
import { fetch } from "undici";

const h = process.env.ALECA_USER_HASH;
const t = process.env.ALECA_TOKEN;
const BASE = "https://stats.alecaframe.com";

const r = await fetch(`${BASE}/api/stats/${h}`, {
  headers: { "Accept": "application/json" }
});

console.log("STATUS:", r.status);
console.log("HEADERS:");
for (const [k, v] of r.headers) console.log(" ", k, ":", v);
console.log("BODY:", (await r.text()).slice(0, 300));