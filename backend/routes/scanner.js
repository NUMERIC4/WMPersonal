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
  const allSlugs = items.map(i => i.url_name);

  const counts = {};
  for (const item of items) {
    const g = classifyItem(item.item_name, item.url_name);
    if (g) counts[g] = (counts[g] ?? 0) + 1;
  }
  counts["All Items"] = items.length;

  // Custom groups (non-empty only)
  const customGroups = db.prepare(
    "SELECT cg.name, COUNT(cgi.url_name) as cnt " +
    "FROM custom_groups cg " +
    "LEFT JOIN custom_group_items cgi ON cgi.group_id = cg.id " +
    "GROUP BY cg.id HAVING cnt > 0"
  ).all();
  for (const g of customGroups) counts[`★ ${g.name}`] = g.cnt;

  // NPC/syndicate groups — use exact slug matching against local DB
  const SYNDICATE_SLUGS = {
    "⚔ Steel Meridian":    ["vaykor_hek","vaykor_marelok","vaykor_sydon","scattered_justice","final_harbinger","bleeding_willow","ironclad_charge","divine_spears","warcry","flowing_strike","celestial_stomp","smite_infusion","killing_blow","iron_vault","high_noon","renewal","ore_gaze","blazing_chakram","burning_wasp","roar","eclipse"],
    "📚 Arbiters of Hexis": ["telos_boltor","telos_akbolto","telos_boltace","entropy_burst","entropy_detonation","entropy_flight","fatal_teleport","elusive_ward","shelter_against_storm","empowered_quiver","guardian_derision","ghoulish_gaze","irradiating_disarm","radiant_finish","lasting_covenant","rending_turn"],
    "🔬 Cephalon Suda":     ["synoid_gammacor","synoid_simulor","synoid_helicor","kinetic_diversion","null_audit","neutralizing_justice","resonating_quake","sonic_fracture","lifeblood","target_acquired","pilfering_swarm","master_thief","prism_guard","rift_torrent","overwhelming_fumes","wicked_might","lethal_infliction"],
    "💰 Perrin Sequence":   ["secura_penta","secura_dual_cestra","secura_lecta","tether_grenades","new_strange","hemorrhage","accumulating_whipclaw","spectrorage","manic_instinct","vicious_spread","directed_convergence","iron_shrapnel"],
    "🩸 Red Veil":          ["rakta_ballistica","rakta_cernos","rakta_dark_dagger","gleaming_blight","seeding_step","guardian_shell","blood_altar","spellbind","navigator","subsumed_fury","targeting_receptor","savior_decoy","smoke_shadow","tidal_impunity","fatal_acceleration","fire_fright","reaping_chakram"],
    "🌿 New Loka":          ["sancti_tigris","sancti_castanas","sancti_magistar","lasting_sting","concentrated_arrow","whirlwind","tempest_barrage","magnetize","empowered_blades","elemental_sandstorm","warding_grace","chromatic_blade","ensnare","molt_vigor","ring_of_fire"],
    "🏛 Entrati":           ["necramech_friction","necramech_drift","necramech_blitz","necramech_continuity","necramech_deflection","necramech_enemy_sense","necramech_fury","necramech_hydraulics","necramech_redirection","necramech_seismic_wave","necramech_streamline","necramech_stretch","necramech_vitality","necramech_intensity","necramech_pressure_point"],
    "🌙 Nightwave":         ["wolf_sledge_set","wolf_sledge_blueprint","wolf_sledge_head","wolf_sledge_handle","wolf_sledge_motor","umbra_forma_blueprint","dread_mirror"],
  };

  for (const [label, slugs] of Object.entries(SYNDICATE_SLUGS)) {
    const found = slugs.filter(s => allSlugs.includes(s)).length;
    if (found > 0) counts[label] = found;
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