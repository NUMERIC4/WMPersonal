import { Router } from "express";
import { getDb } from "../db.js";
import { fetchPriceSnapshot } from "../sync.js";
import { fetchAndStoreStats } from "./stats.js";

const router = Router();

// Classify items into groups by name patterns
function classifyItem(item_name, url_name) {
  const n = item_name.toLowerCase();
  const u = url_name.toLowerCase();

  if (n.startsWith("arcane ") || n.startsWith("arcane_"))         return "Arcanes";
  if (n.startsWith("primed "))                                     return "Primed Mods";
  if (u.includes("_set") && (
    n.includes("prime") || n.includes("vandal") || n.includes("wraith") ||
    n.includes("prisma") || n.includes("syndicate")))              return detectWeaponSetGroup(n);
  if (u.includes("_set"))                                          return detectWeaponSetGroup(n);
  if (n.includes("relic"))                                         return "Relics";
  if (n.startsWith("necramech "))                                  return "Necramech Mods";
  if (isMod(n))                                                    return "Mods";
  if (isPart(n))                                                   return detectPartGroup(n);
  return null;
}

function detectWeaponSetGroup(n) {
  const melee  = ["sword","blade","axe","hammer","scythe","staff","whip","claw","fist","glaive","nikana","nunchaku","tonfa","rapier","war","bo ","dera","mire","zaw"];
  const second = ["pistol","aklex","akjagara","akvasto","akstiletto","twin","viper","furis","hikou","castanas","despair","kunai","atomos","sicarus","lex","magnus","pandero","pyrana","rattleguts","sonicor","spira","staticor","stug","talons","zakti"];
  if (melee.some(k  => n.includes(k))) return "Melee Sets";
  if (second.some(k => n.includes(k))) return "Secondary Sets";
  return "Primary Sets";
}

function detectPartGroup(n) {
  const melee  = ["blade","handle","head","hilt","chain","grip","strike"];
  const second = ["barrel","link","receiver","stock","lower receiver","upper receiver"];
  if (melee.some(k  => n.includes(k))) return "Melee Parts";
  if (second.some(k => n.includes(k))) return "Secondary Parts";
  return "Primary Parts";
}

function isMod(n) {
  const modWords = ["continuity","intensify","stretch","flow","vitality","redirection","streamline","steel fiber","rush","overextended","transient fortitude","narrow minded","blind rage","fleeting expertise","constitution","natural talent","augur","galvanized","gladiator","vigilante","amalgam"];
  return modWords.some(k => n.includes(k));
}

function isPart(n) {
  return ["blueprint","barrel","stock","receiver","blade","handle","head","link","neuroptics","chassis","systems","carapace","cerebrum","harness"].some(k => n.includes(k));
}

let cancelFlag = false;

// GET /api/scanner/groups — list groups with item counts (built-in + custom + NPC)
router.get("/groups", (req, res) => {
  const db = getDb();
  const items = db.prepare("SELECT item_name, url_name FROM items").all();

  const counts = {};
  for (const item of items) {
    const g = classifyItem(item.item_name, item.url_name);
    if (g) counts[g] = (counts[g] ?? 0) + 1;
  }
  counts["All Items"] = items.length;

  // Add custom groups (non-empty only)
  const customGroups = db.prepare(
    "SELECT cg.id, cg.name, COUNT(cgi.url_name) as cnt " +
    "FROM custom_groups cg " +
    "LEFT JOIN custom_group_items cgi ON cgi.group_id = cg.id " +
    "GROUP BY cg.id HAVING cnt > 0"
  ).all();
  for (const g of customGroups) counts[`★ ${g.name}`] = g.cnt;

  // Add NPC/syndicate groups
  const SYNDICATE_PATTERNS = {
    "⚔ Steel Meridian":    ["vaykor","morgha","shrapnel rounds"],
    "📚 Arbiters of Hexis": ["telos","sancti"],
    "🔬 Cephalon Suda":     ["synoid"],
    "🩸 Red Veil":          ["rakta","sacrificial"],
    "🌿 New Loka":          ["locust","new loka"],
    "💰 Perrin Sequence":   ["secura"],
    "🌙 Nightwave":         ["wolf","nora"],
    "🏛 Entrati":           ["necramech","entrati"],
    "🦷 Quills / Arcanes":  ["arcane "],
    "☠ Necraloid":         ["latrox","necraloid"],
  };
  for (const [label, keywords] of Object.entries(SYNDICATE_PATTERNS)) {
    const c = items.filter(i => keywords.some(k => i.item_name.toLowerCase().includes(k))).length;
    if (c > 0) counts[label] = c;
  }

  res.json(counts);
});

// POST /api/scanner/cancel
router.post("/cancel", (req, res) => {
  cancelFlag = true;
  res.json({ cancelled: true });
});

// GET /api/scanner/run?group=Arcanes — SSE stream with progress
router.get("/run", async (req, res) => {
  const group = req.query.group ?? "All Items";
  cancelFlag = false;

  // SSE headers
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  function send(data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  const db = getDb();
  let items = db.prepare("SELECT item_name, url_name FROM items").all();

  // Filter by group
  if (group === "All Items") {
    // keep all
  } else if (group.startsWith("★ ")) {
    // Custom group
    const name = group.slice(2);
    const g = db.prepare("SELECT id FROM custom_groups WHERE name = ?").get(name);
    if (g) {
      const slugs = db.prepare("SELECT url_name FROM custom_group_items WHERE group_id = ?").all(g.id).map(r => r.url_name);
      items = items.filter(i => slugs.includes(i.url_name));
    } else items = [];
  } else if (group.match(/^[⚔📚🔬🩸🌿💰🌙🏛🦷☠]/)) {
    // NPC/syndicate group — filter by keyword
    const KEYWORDS = {
      "⚔ Steel Meridian":    ["vaykor","morgha","shrapnel rounds"],
      "📚 Arbiters of Hexis": ["telos","sancti"],
      "🔬 Cephalon Suda":     ["synoid"],
      "🩸 Red Veil":          ["rakta","sacrificial"],
      "🌿 New Loka":          ["locust","new loka"],
      "💰 Perrin Sequence":   ["secura"],
      "🌙 Nightwave":         ["wolf","nora"],
      "🏛 Entrati":           ["necramech","entrati"],
      "🦷 Quills / Arcanes":  ["arcane "],
      "☠ Necraloid":         ["latrox","necraloid"],
    };
    const kws = KEYWORDS[group] ?? [];
    items = items.filter(i => kws.some(k => i.item_name.toLowerCase().includes(k)));
  } else {
    items = items.filter(i => classifyItem(i.item_name, i.url_name) === group);
  }

  // Sort: oldest snapshot first, never-fetched alphabetically at front
  const lastFetched = {};
  const snaps = db.prepare(
    "SELECT url_name, MAX(fetched_at) as last FROM price_snapshots GROUP BY url_name"
  ).all();
  for (const s of snaps) lastFetched[s.url_name] = s.last;

  items.sort((a, b) => {
    const fa = lastFetched[a.url_name], fb = lastFetched[b.url_name];
    if (!fa && !fb) return a.item_name.localeCompare(b.item_name);
    if (!fa) return -1;
    if (!fb) return 1;
    return fa < fb ? -1 : 1;
  });

  const total = items.length;
  send({ type: "start", total, group });

  let done = 0;
  for (const item of items) {
    if (cancelFlag) {
      send({ type: "cancelled", done, total });
      res.end();
      return;
    }

    try {
      const snap = await fetchPriceSnapshot(item.url_name);
      send({ type: "progress", done: ++done, total, item: item.item_name, snap });
    } catch (e) {
      send({ type: "progress", done: ++done, total, item: item.item_name, error: e.message });
    }
  }

  send({ type: "done", done, total });
  res.end();
});

export default router;