import { Router } from "express";
import { getDb } from "../db.js";

const router = Router();

// ── Syndicate item definitions ────────────────────────────────────────────────
// Each syndicate lists exact warframe.market url_name slugs for their
// exclusive weapons + augment mods (weapon & warframe augments)
const SYNDICATE_ITEMS = {
  "⚔ Steel Meridian": [
    // Weapons
    "vaykor_hek","vaykor_marelok","vaykor_sydon",
    // Weapon augments
    "scattered_justice","final_harbinger","bleeding_willow",
    // Warframe augments
    "ironclad_charge","divine_spears","warcry",
    "flowing_strike","celestial_stomp","smite_infusion",
    "killing_blow","iron_vault","high_noon",
    "renewal","ore_gaze","blazing_chakram",
    "burning_wasp","roar","eclipse",
  ],
  "📚 Arbiters of Hexis": [
    // Weapons
    "telos_boltor","telos_akbolto","telos_boltace",
    // Weapon augments
    "entropy_burst","entropy_detonation","entropy_flight",
    // Warframe augments
    "fatal_teleport","elusive_ward","shelter_against_storm",
    "empowered_quiver","guardian_derision","ghoulish_gaze",
    "irradiating_disarm","disruptor","equinox",
    "radiant_finish","lasting_covenant","rending_turn",
  ],
  "🔬 Cephalon Suda": [
    // Weapons
    "synoid_gammacor","synoid_simulor","synoid_helicor",
    // Weapon augments
    "kinetic_diversion","null_audit","neutralizing_justice",
    // Warframe augments
    "resonating_quake","sonic_fracture","lifeblood",
    "target_acquired","pilfering_swarm","master_thief",
    "prism_guard","eclipse","rift_torrent",
    "overwhelming_fumes","wicked_might","lethal_infliction",
  ],
  "💰 Perrin Sequence": [
    // Weapons
    "secura_penta","secura_dual_cestra","secura_lecta",
    // Weapon augments
    "tether_grenades","new_strange","hemorrhage",
    // Warframe augments
    "accumulating_whipclaw","spectrorage","sonic_fracture",
    "manic_instinct","vicious_spread","directed_convergence",
    "nidus_augment","rhino_augment","trinity_augment",
    "mag_shatter","iron_shrapnel","vauban_augment",
  ],
  "🩸 Red Veil": [
    // Weapons
    "rakta_ballistica","rakta_cernos","rakta_dark_dagger",
    // Weapon augments
    "gleaming_blight","seeding_step","guardian_shell",
    // Warframe augments
    "blood_altar","spellbind","navigator",
    "accumulating_whipclaw","subsumed_fury","targeting_receptor",
    "savior_decoy","smoke_shadow","tidal_impunity",
    "fatal_acceleration","fire_fright","reaping_chakram",
  ],
  "🌿 New Loka": [
    // Weapons
    "sancti_tigris","sancti_castanas","sancti_magistar",
    // Weapon augments
    "lasting_sting","concentrated_arrow","whirlwind",
    // Warframe augments
    "equinox_augment","gara_augment","tempest_barrage",
    "magnetize","empowered_blades","elemental_sandstorm",
    "warding_grace","wukong_augment","chromatic_blade",
    "ensnare","molt_vigor","ring_of_fire",
  ],
  "🏛 Entrati": [
    "necramech_friction","necramech_drift","necramech_blitz",
    "necramech_continuity","necramech_deflection","necramech_enemy_sense",
    "necramech_fury","necramech_hydraulics","necramech_redirection",
    "necramech_seismic_wave","necramech_streamline","necramech_stretch",
    "necramech_vitality","necramech_intensity","necramech_pressure_point",
  ],
  "☠ Necraloid": [
    "latrox_une_series","otak_augment",
  ],
  "🌙 Nightwave": [
    "wolf_sledge_set","wolf_sledge_blueprint","wolf_sledge_head",
    "wolf_sledge_handle","wolf_sledge_motor",
    "umbra_forma_blueprint",
    "dread_mirror","blood_altar",
  ],
  "🛡 Teshin / Steel Path": [
    "arcane_adapter","arcane_energize","arcane_grace",
    "heavy_gunner_eximus","kuva",
  ],
  "🔭 Cephalon Simaris": [
    "simulate","cephalon_simaris_augment",
  ],
};

// ── Custom Groups CRUD ────────────────────────────────────────────────────────

router.get("/", (req, res) => {
  const db = getDb();
  const groups = db.prepare("SELECT * FROM custom_groups ORDER BY name").all();
  const result = groups.map(g => {
    const items = db.prepare(
      "SELECT cgi.url_name, i.item_name FROM custom_group_items cgi " +
      "LEFT JOIN items i ON i.url_name = cgi.url_name " +
      "WHERE cgi.group_id = ? ORDER BY i.item_name"
    ).all(g.id);
    return { ...g, items };
  }).filter(g => g.items.length > 0);
  res.json(result);
});

router.post("/", (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "name required" });
  const db = getDb();
  try {
    const r = db.prepare("INSERT INTO custom_groups (name) VALUES (?)").run(name.trim());
    res.json({ id: r.lastInsertRowid, name: name.trim(), items: [] });
  } catch (e) { res.status(409).json({ error: "Group already exists" }); }
});

router.delete("/:id", (req, res) => {
  getDb().prepare("DELETE FROM custom_groups WHERE id = ?").run(req.params.id);
  res.json({ deleted: true });
});

router.patch("/:id", (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "name required" });
  getDb().prepare("UPDATE custom_groups SET name = ? WHERE id = ?").run(name.trim(), req.params.id);
  res.json({ updated: true });
});

router.post("/:id/items", (req, res) => {
  const { url_name } = req.body;
  if (!url_name) return res.status(400).json({ error: "url_name required" });
  try {
    getDb().prepare("INSERT OR IGNORE INTO custom_group_items (group_id, url_name) VALUES (?, ?)").run(req.params.id, url_name);
    res.json({ added: url_name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/:id/items/:url_name", (req, res) => {
  getDb().prepare("DELETE FROM custom_group_items WHERE group_id = ? AND url_name = ?").run(req.params.id, req.params.url_name);
  res.json({ removed: req.params.url_name });
});

// ── NPC / Syndicate groups ────────────────────────────────────────────────────

// GET /api/customgroups/npc/list — names + counts, cross-referenced against local DB
router.get("/npc/list", (req, res) => {
  const db = getDb();
  const allItems = db.prepare("SELECT url_name FROM items").all().map(r => r.url_name);

  const result = {};
  for (const [syndicate, slugs] of Object.entries(SYNDICATE_ITEMS)) {
    const found = slugs.filter(s => allItems.includes(s)).length;
    if (found > 0) result[syndicate] = found;
  }
  res.json(result);
});

// GET /api/customgroups/npc/:syndicate — items for one syndicate
router.get("/npc/:syndicate", (req, res) => {
  const name = decodeURIComponent(req.params.syndicate);
  const slugs = SYNDICATE_ITEMS[name];
  if (!slugs) return res.status(404).json({ error: "Syndicate not found" });

  const db = getDb();
  const items = slugs.map(slug => {
    const row = db.prepare("SELECT url_name, item_name FROM items WHERE url_name = ?").get(slug);
    return row ?? { url_name: slug, item_name: slug };
  });
  res.json(items);
});

// GET /api/customgroups/npc — all syndicates with their items
router.get("/npc", (req, res) => {
  const db = getDb();
  const allItems = db.prepare("SELECT url_name, item_name FROM items").all();
  const bySlug = Object.fromEntries(allItems.map(i => [i.url_name, i.item_name]));

  const result = {};
  for (const [syndicate, slugs] of Object.entries(SYNDICATE_ITEMS)) {
    const matched = slugs
      .filter(s => bySlug[s])
      .map(s => ({ url_name: s, item_name: bySlug[s] }));
    if (matched.length > 0) result[syndicate] = matched;
  }
  res.json(result);
});

export default router;