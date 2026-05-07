import "dotenv/config";
import { fetch } from "undici";

const INTERVAL_MS = 340;
const queue = [];
let running = false;

function processQueue() {
  if (running || queue.length === 0) return;
  running = true;

  const { url, resolve, reject } = queue.shift();

  const headers = {
    "accept":          "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "language":        "en",
    "platform":        "pc",
    "user-agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "referer":         "https://warframe.market/",
    "origin":          "https://warframe.market",
  };

  if (process.env.WFM_JWT) {
    headers["Authorization"] = process.env.WFM_JWT;
  }

  fetch(url, { headers })
    .then(async (res) => {
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      resolve(JSON.parse(text));
    })
    .catch(reject)
    .finally(() => {
      setTimeout(() => {
        running = false;
        processQueue();
      }, INTERVAL_MS);
    });
}

export function queueFetch(url) {
  return new Promise((resolve, reject) => {
    queue.push({ url, resolve, reject });
    processQueue();
  });
}

export function queueLength() {
  return queue.length;
}