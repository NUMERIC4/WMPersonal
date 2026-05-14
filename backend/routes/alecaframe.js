import { Router } from "express";
import { fetch } from "undici";

const router = Router();
const BASE = "https://stats.alecaframe.com";
const INTERVAL_MS = 1050;
const RELIC_TYPES = ["Lith", "Meso", "Neo", "Axi", "Requiem"];
const RELIC_REFINEMENTS = ["Intact", "Exceptional", "Flawless", "Radiant", "Exceptional", "Flawless", "Radiant"];

const queue = [];
let running = false;

function processQueue() {
  if (running || queue.length === 0) return;
  running = true;
  const { path, resolve, reject, binary } = queue.shift();

  fetch(`${BASE}${path}`, { headers: { Accept: binary ? "application/octet-stream" : "application/json" } })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        const err = new Error(`Alecaframe HTTP ${res.status}: ${text.slice(0, 240)}`);
        err.status = res.status;
        throw err;
      }
      resolve(binary ? Buffer.from(await res.arrayBuffer()) : await res.json());
    })
    .catch(reject)
    .finally(() => {
      setTimeout(() => {
        running = false;
        processQueue();
      }, INTERVAL_MS);
    });
}

function alecaFetch(path, options = {}) {
  return new Promise((resolve, reject) => {
    queue.push({ path, resolve, reject, binary: options.binary });
    processQueue();
  });
}

function getStatsPath() {
  const publicToken = process.env.ALECA_PUBLIC_TOKEN ?? process.env.ALECA_TOKEN;
  const userHash = process.env.ALECA_USER_HASH;
  const secretToken = process.env.ALECA_SECRET_TOKEN;

  if (publicToken) return `/api/stats/public?token=${encodeURIComponent(publicToken)}`;
  if (userHash) {
    const qs = secretToken ? `?secretToken=${encodeURIComponent(secretToken)}` : "";
    return `/api/stats/${encodeURIComponent(userHash)}${qs}`;
  }
  return null;
}

function latestPoint(stats) {
  return [...(stats.generalDataPoints ?? [])]
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))[0] ?? null;
}

function summarize(stats) {
  const points = [...(stats.generalDataPoints ?? [])].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const latest = points.at(-1) ?? null;
  const previous = points.at(-2) ?? null;
  const trades = stats.trades ?? [];

  const sales = trades.filter(t => t.type === 0);
  const purchases = trades.filter(t => t.type === 1);
  const salePlat = sales.reduce((sum, t) => sum + (t.totalPlat ?? 0), 0);
  const purchasePlat = purchases.reduce((sum, t) => sum + (t.totalPlat ?? 0), 0);

  return {
    lastUpdate: stats.lastUpdate,
    username: stats.usernameWhenPublic ?? null,
    latest,
    delta: latest && previous ? {
      plat: latest.plat - previous.plat,
      credits: latest.credits - previous.credits,
      endo: latest.endo - previous.endo,
      trades: latest.trades - previous.trades,
      relicOpened: latest.relicOpened - previous.relicOpened,
    } : null,
    tradeSummary: {
      count: trades.length,
      sales: sales.length,
      purchases: purchases.length,
      salePlat,
      purchasePlat,
      netPlat: salePlat - purchasePlat,
    },
  };
}

function decodeRelics(buffer) {
  if (!buffer?.length) return [];
  const count = buffer.readUInt32LE(0);
  const relics = [];
  let offset = 4;

  for (let i = 0; i < count && offset + 9 <= buffer.length; i++) {
    const type = buffer.readUInt8(offset);
    const refinement = buffer.readUInt8(offset + 1);
    const name = buffer.toString("ascii", offset + 2, offset + 5).replace(/\0/g, "").trim();
    const quantity = buffer.readUInt32LE(offset + 5);
    relics.push({
      relic: `${RELIC_TYPES[type] ?? "Unknown"} ${name}`,
      type: RELIC_TYPES[type] ?? "Unknown",
      name,
      refinement: RELIC_REFINEMENTS[refinement] ?? "Unknown",
      quantity,
    });
    offset += 9;
  }

  return relics.sort((a, b) =>
    a.type.localeCompare(b.type) ||
    a.name.localeCompare(b.name) ||
    a.refinement.localeCompare(b.refinement)
  );
}

async function getStatsData() {
  const path = getStatsPath();
  if (!path) {
    const err = new Error("Configure ALECA_PUBLIC_TOKEN or ALECA_USER_HASH in backend/.env");
    err.status = 400;
    throw err;
  }
  return alecaFetch(path);
}

router.get("/status", (req, res) => {
  res.json({
    configured: Boolean(getStatsPath()),
    relicsConfigured: Boolean(process.env.ALECA_RELIC_TOKEN ?? process.env.ALECA_PUBLIC_TOKEN ?? process.env.ALECA_TOKEN),
    mode: (process.env.ALECA_PUBLIC_TOKEN ?? process.env.ALECA_TOKEN) ? "public" : process.env.ALECA_USER_HASH ? "private" : "missing",
  });
});

router.get("/stats", async (req, res) => {
  try {
    res.json(await getStatsData());
  } catch (error) {
    res.status(error.status ?? 500).json({ error: error.message });
  }
});

router.get("/summary", async (req, res) => {
  try {
    res.json(summarize(await getStatsData()));
  } catch (error) {
    res.status(error.status ?? 500).json({ error: error.message });
  }
});

router.get("/trades", async (req, res) => {
  try {
    const stats = await getStatsData();
    res.json([...(stats.trades ?? [])].sort((a, b) => new Date(b.ts) - new Date(a.ts)));
  } catch (error) {
    res.status(error.status ?? 500).json({ error: error.message });
  }
});

router.get("/relics", async (req, res) => {
  const token = process.env.ALECA_RELIC_TOKEN ?? process.env.ALECA_PUBLIC_TOKEN ?? process.env.ALECA_TOKEN;
  if (!token) return res.status(400).json({ error: "Configure ALECA_RELIC_TOKEN or ALECA_PUBLIC_TOKEN in backend/.env" });

  try {
    const data = await alecaFetch(
      `/api/stats/public/getRelicInventory?publicToken=${encodeURIComponent(token)}`,
      { binary: true }
    );
    res.json(decodeRelics(data));
  } catch (error) {
    res.status(error.status ?? 500).json({ error: error.message });
  }
});

export default router;
