import "dotenv/config";
import { fetch } from "undici";

const h = process.env.ALECA_USER_HASH;
const t = process.env.ALECA_TOKEN;

console.log("Hash starts with:", h?.slice(0, 8));
console.log("Token starts with:", t?.slice(0, 8));

const BASE = "https://stats.alecaframe.com/api/v1";
const headers = { "Accept": "application/json", "Authorization": "Bearer " + t };

for (const ep of ["trades", "stats", "relics", "profile"]) {
  try {
    const r = await fetch(`${BASE}/${h}/${ep}`, { headers });
    const text = await r.text();
    console.log(`\n[${ep}] STATUS: ${r.status}`);
    console.log(text.slice(0, 400));
  } catch (e) {
    console.log(`[${ep}] ERROR:`, e.message);
  }
}