import { fetch } from "undici";

const INTERVAL_MS = 340; // ~3 req/s with safety buffer
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 15000;
const RETRY_AFTER_BUFFER_MS = 1000;

const queue = [];
let running = false;

function parseRetryAfter(header) {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

function scheduleNext(delayMs = INTERVAL_MS) {
  setTimeout(() => {
    running = false;
    processQueue();
  }, delayMs);
}

function shouldRetry(error, attempts) {
  if (attempts >= MAX_RETRIES) return false;
  if (error.status === 429) return true;
  if (error.status >= 500) return true;
  return false;
}

function retryDelay(error, attempts) {
  const retryAfter = parseRetryAfter(error.retryAfter);
  const backoff = Math.min(BASE_RETRY_DELAY_MS * 2 ** attempts, MAX_RETRY_DELAY_MS);
  const jitter = Math.floor(Math.random() * 250);
  return Math.max(backoff + jitter, retryAfter !== null ? retryAfter + RETRY_AFTER_BUFFER_MS : 0);
}

function processQueue() {
  if (running || queue.length === 0) return;
  running = true;

  const request = queue.shift();
  const { url, resolve, reject, attempts = 0 } = request;

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
      if (!res.ok) {
        let body = null;
        try { body = JSON.parse(text); } catch (_) { body = text; }
        const error = new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
        error.status = res.status;
        error.body = body;
        error.retryAfter = res.headers.get("retry-after");
        throw error;
      }
      resolve(JSON.parse(text));
    })
    .catch((error) => {
      if (shouldRetry(error, attempts)) {
        const delay = retryDelay(error, attempts);
        queue.push({ url, resolve, reject, attempts: attempts + 1 });
        setTimeout(() => processQueue(), delay);
        return;
      }
      reject(error);
    })
    .finally(() => {
      scheduleNext();
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