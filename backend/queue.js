import { fetch } from "undici";

const INTERVAL_MS = 340; // ~3 req/s with safety buffer
const queue = [];
let running = false;

function processQueue() {
  if (running || queue.length === 0) return;
  running = true;

  const { url, resolve, reject } = queue.shift();

  fetch(url, {
    headers: {
      "Accept":       "application/json",
      "Language":     "en",
      "Platform":     "pc",
      "Crossplay":    "true",
    },
  })
    .then(async (res) => {
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
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