const INTERVAL_MS = 340;
const queue = [];
let running = false;

function processQueue() {
  if (running || queue.length === 0) return;
  running = true;

  const { url, resolve, reject } = queue.shift();

  fetch(url, {
    headers: {
      "Language":   "en",
      "Platform":   "pc",
      "Accept":     "application/json",
      "User-Agent": "WMPersonal/1.0 (personal monitor tool)",
    },
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status} for ${url}`);
      resolve(await res.json());
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