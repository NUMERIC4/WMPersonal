import { Router } from "express";
import { getDb } from "../db.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// SYNDICATE_ITEMS
//
// All slugs are warframe.market url_name format (lowercase, spaces → underscores).
// Each syndicate is split into three sub-categories:
//   weapons      — the 3 exclusive syndicate weapons (tradeable when unranked)
//   weapon_mods  — the 4 weapon augment mods (Justice/Entropy/etc. procs)
//   wf_mods      — the warframe augment mods sold at max rank
//
// Sources verified against wiki.warframe.com and warframe.market item slugs.
// Items shared between syndicates (e.g. Smite Infusion) appear in both.
// Placeholder names from the previous version have been replaced with real slugs.
// ─────────────────────────────────────────────────────────────────────────────
const SYNDICATE_ITEMS = {

  // ── STEEL MERIDIAN ─────────────────────────────────────────────────────────
  // Weapons: Justice proc   |  WF augs: Atlas, Citrine, Ember, Excalibur,
  //   Frost, Garuda, Grendel, Khora, Kullervo, Mesa, Nezha, Nidus, Nova,
  //   Oberon, Qorvex, Rhino, Saryn, Voruna, Xaku
  "⚔ Steel Meridian": {
    weapons: [
      "vaykor_hek",
      "vaykor_marelok",
      "vaykor_sydon",
    ],
    weapon_mods: [
      "scattered_justice",       // Hek augment   — extra pellets on Justice proc
      "final_harbinger",         // Dual Cleavers — Justice proc
      "bleeding_willow",         // Miter augment — Justice proc
      "acid_shells",             // Sobek augment — Justice proc
    ],
    wf_mods: [
      // Atlas
      "ore_gaze",                // Atlas — Petrify augment
      // Citrine  (newer — may not be on WM yet)
      // Ember
      "firequake",               // Ember — Inferno augment
      // Excalibur
      "surging_dash",            // Excalibur — Slash Dash augment
      // Frost
      "ice_wave_impedance",      // Frost — Ice Wave augment
      // Garuda
      "blood_forge",             // Garuda — Seeking Talons augment
      // Grendel
      "nourish_augment",         // Grendel — Nourish (listed as "nourish" on WM)
      // Khora
      "accumulating_whipclaw",   // Khora — Whipclaw augment (shared with Perrin)
      // Mesa
      "staggering_shield",       // Mesa — Shooting Gallery augment
      // Nezha
      "pyroclastic_flow",        // Nezha — Fire Walker augment
      // Nidus
      "teeming_virulence",       // Nidus — Virulence augment
      // Nova
      "molecular_fission",       // Nova — Null Star augment
      // Oberon
      "smite_infusion",          // Oberon — Smite augment (shared with New Loka)
      "hallowed_eruption",       // Oberon — Hallowed Ground augment
      "phoenix_renewal",         // Oberon — Renewal augment
      // Rhino
      "ironclad_charge",         // Rhino — Rhino Charge augment (shared with Perrin)
      "iron_shrapnel",           // Rhino — Iron Skin augment
      "reinforcing_stomp",       // Rhino — Rhino Stomp augment
      // Saryn
      "venom_dose",              // Saryn — Spores augment
      "regenerative_molt",       // Saryn — Molt augment
      "contagion_cloud",         // Saryn — Toxic Lash augment
      // Xaku
      "grasp_of_lohk",           // Xaku augment (newer; may not be on WM)
    ],
  },

  // ── ARBITERS OF HEXIS ──────────────────────────────────────────────────────
  // Weapons: Entropy proc   |  WF augs: Ash, Baruuk, Equinox, Excalibur,
  //   Gara, Gauss, Gyre, Harrow, Inaros, Limbo, Loki, Mirage, Nyx,
  //   Protea, Styanax, Volt, Wukong (and Excalibur Umbra)
  "📚 Arbiters of Hexis": {
    weapons: [
      "telos_boltor",
      "telos_akbolto",
      "telos_boltace",
    ],
    weapon_mods: [
      "entropy_burst",           // Supra augment     — Entropy proc
      "entropy_detonation",      // Penta augment     — Entropy proc
      "entropy_flight",          // Castanas augment  — Entropy proc
      "entropy_spike",           // Bolto augment     — Entropy proc
    ],
    wf_mods: [
      // Ash
      "fatal_teleport",          // Ash — Teleport augment
      "seeking_shuriken",        // Ash — Shuriken augment
      "smoke_shadow",            // Ash — Smoke Screen augment
      // Baruuk
      "serene_storm",            // Baruuk augment (newer)
      // Equinox
      "calm_and_frenzy",         // Equinox — Mend & Maim augment
      "duality",                 // Equinox — Metamorphosis augment
      "peaceful_provocation",    // Equinox — Rest & Rage augment
      // Excalibur
      "surging_dash",            // Excalibur — Slash Dash (shared with Meridian)
      "radiant_finish",          // Excalibur — Radial Blind augment
      "lasting_covenant",        // Excalibur — Radial Howl augment
      // Gara
      "shattered_storm",         // Gara — Shattered Lash augment
      "spectrosiphon",           // Gara — Spectrorage augment
      // Gauss
      "kinetic_plating",         // Gauss augment (newer)
      // Gyre
      // Harrow
      "warding_thurible",        // Harrow — Thurible augment (newer)
      // Inaros
      "negation_swarm",          // Inaros — Scarab Swarm augment
      // Limbo
      "rift_torrent",            // Limbo — Rift Surge augment (shared with Suda)
      "rift_haven",              // Limbo — Stasis augment
      // Loki
      "irradiating_disarm",      // Loki — Radial Disarm augment
      "savior_decoy",            // Loki — Decoy augment (shared with Veil)
      "hushed_invisibility",     // Loki — Invisibility augment
      // Mirage
      "hall_of_malevolence",     // Mirage — Hall of Mirrors augment
      "eclipse",                 // Mirage — Eclipse augment (shared with Suda)
      // Nyx
      "assimilate",              // Nyx — Absorb augment
      "mind_freak",              // Nyx — Mind Control augment
      "pacifying_bolts",         // Nyx — Psychic Bolts augment
      // Protea
      // Styanax
      // Volt
      "electric_shield",         // Volt — Electric Shield augment
      "capacitance",             // Volt — Discharge augment
      "shocking_speed",          // Volt — Speed augment
      // Wukong
      "celestial_stomp",         // Wukong — Celestial Twin augment (shared with Suda? check)
      "primal_cry",              // Wukong — Wukong augment (newer)
    ],
  },

  // ── CEPHALON SUDA ──────────────────────────────────────────────────────────
  // Weapons: Discharge proc  |  WF augs: Banshee, Chroma, Frost, Hydroid,
  //   Ivara, Limbo, Mirage, Nezha, Nova, Octavia, Vauban
  "🔬 Cephalon Suda": {
    weapons: [
      "synoid_gammacor",
      "synoid_simulor",
      "synoid_helicor",
    ],
    weapon_mods: [
      "kinetic_diversion",       // Lex augment       — Discharge proc
      "targeting_receptor",      // Vulkar augment    — Discharge proc
      "neutralizing_justice",    // Gammacor augment  — Discharge proc
      "null_audit",              // Supra augment (Suda variant)
    ],
    wf_mods: [
      // Banshee
      "resonating_quake",        // Banshee — Sound Quake augment
      "sonic_fracture",          // Banshee — Sonic Boom augment (shared with Perrin)
      "sonar",                   // Banshee — Resonance augment
      // Chroma
      "afterburn",               // Chroma — Spectral Scream augment
      "vexing_retaliation",      // Chroma — Vex Armor augment
      // Frost
      "ice_wave_impedance",      // Frost (shared with Meridian)
      "ice_storm",               // Frost — Globe augment
      // Hydroid
      "pilfering_swarm",         // Hydroid — Tentacle Swarm augment
      "tidal_impunity",          // Hydroid — Tidal Surge augment (shared with Veil)
      "tempest_barrage",         // Hydroid — Tempest Barrage augment (shared with Loka)
      // Ivara
      "empowered_quiver",        // Ivara — Quiver augment (shared with Arbiters)
      "piercing_navigator",      // Ivara — Navigator augment
      "infiltrate",              // Ivara — Prowl augment
      // Limbo
      "rift_torrent",            // Limbo (shared with Arbiters)
      "rift_haven",              // Limbo (shared)
      // Mirage
      "eclipse",                 // Mirage — Eclipse augment
      "prism_guard",             // Mirage — Prism augment
      "sleight_of_hand",         // Mirage augment (newer)
      // Nezha
      "safeguard",               // Nezha — Warding Halo augment (shared with Loka)
      // Nova
      "neutron_star",            // Nova — Null Star augment (shared)
      "antimatter_absorb",       // Nova — Antimatter Drop augment
      // Octavia
      "conductor",               // Octavia — Resonator augment
      "partitioned_mallet",      // Octavia — Mallet augment
      // Vauban
      "tesla_nervos",            // Vauban — Tesla augment (newer name)
      "iron_vault",              // Vauban — Bastille augment
    ],
  },

  // ── THE PERRIN SEQUENCE ────────────────────────────────────────────────────
  // Weapons: Sequence proc  |  WF augs: Banshee, Chroma, Inaros, Ivara,
  //   Mag, Nekros, Nidus, Rhino, Trinity, Valkyr, Vauban
  "💰 Perrin Sequence": {
    weapons: [
      "secura_penta",
      "secura_dual_cestra",
      "secura_lecta",
    ],
    weapon_mods: [
      "tether_grenades",         // Penta augment     — Sequence proc
      "new_strange",             // Gammacor augment  — Sequence proc
      "hemorrhage",              // Hek augment       — Sequence proc
      "directed_convergence",    // Opticor augment   — Sequence proc
    ],
    wf_mods: [
      // Banshee
      "sonic_fracture",          // Banshee (shared with Suda)
      "resonance",               // Banshee — Sonar augment
      // Chroma
      "guided_effigy",           // Chroma — Effigy augment
      // Inaros
      "desiccation_s_curse",     // Inaros — Desiccation augment (WM slug may vary)
      "sandstorm",               // Inaros augment
      // Ivara
      "empowered_quiver",        // Ivara (shared with Suda)
      // Mag
      "magnetized_discharge",    // Mag — Magnetize augment
      "counter_pulse",           // Mag — Polarize augment
      "polarized_coil",          // Mag augment (newer)
      // Nekros
      "despoil",                 // Nekros — Desecrate augment (shared with Veil)
      "shield_of_shadows",       // Nekros — Shadows of the Dead augment
      // Nidus
      "teeming_virulence",       // Nidus (shared with Meridian)
      "larva_burst",             // Nidus — Larva augment
      // Rhino
      "ironclad_charge",         // Rhino (shared with Meridian)
      "iron_shrapnel",           // Rhino (shared with Meridian)
      // Trinity
      "vampire_leech",           // Trinity — Well of Life augment
      "abating_link",            // Trinity — Link augment
      "pool_of_life",            // Trinity — Blessing augment
      // Valkyr
      "prolonged_paralysis",     // Valkyr — Paralysis augment
      "eternal_war",             // Valkyr — Warcry augment (NOT "warcry")
      "hysterical_assault",      // Valkyr — Hysteria augment
      // Vauban
      "tesla_nervos",            // Vauban (shared with Suda)
      "repelling_bastille",      // Vauban — Bastille augment
    ],
  },

  // ── RED VEIL ───────────────────────────────────────────────────────────────
  // Weapons: Blight proc  |  WF augs: Ash, Atlas, Citrine, Dagath, Ember,
  //   Garuda, Grendel, Harrow, Jade, Khora, Lavos, Loki, Mesa, Nekros,
  //   Saryn, Titania, Volt, Voruna, Zephyr
  "🩸 Red Veil": {
    weapons: [
      "rakta_ballistica",
      "rakta_cernos",
      "rakta_dark_dagger",
    ],
    weapon_mods: [
      "gleaming_blight",         // Dual Cleavers augment — Blight proc
      "seeding_step",            // Tipedo augment        — Blight proc
      "guardian_shell",          // Tigris augment        — Blight proc
      "flash_accelerant",        // Embolist augment      — Blight proc
    ],
    wf_mods: [
      // Ash
      "blood_altar",             // Ash — Blood Altar (his Bladestorm augment from Veil)
      "seeking_shuriken",        // Ash (shared with Arbiters)
      "smoke_shadow",            // Ash (shared with Arbiters)
      // Atlas
      "rumbled",                 // Atlas — Rumblers augment
      "landslide",               // Atlas augment
      // Ember
      "healing_flame",           // Ember — Fire Blast augment
      "flashpoint",              // Ember — Accelerant augment
      // Garuda
      "blending_talons",         // Garuda augment (newer)
      // Harrow
      "thurible",                // Harrow augment
      // Khora
      "pilfering_strangledome",  // Khora — Strangledome augment
      // Lavos
      // Loki
      "irradiating_disarm",      // Loki (shared with Arbiters)
      "savior_decoy",            // Loki (shared with Arbiters)
      "hushed_invisibility",     // Loki (shared with Arbiters)
      // Mesa
      "shooting_gallery",        // Mesa — Shooting Gallery augment
      "ballistic_bullseye",      // Mesa — Ballistic Battery augment
      // Nekros
      "despoil",                 // Nekros (shared with Perrin)
      "shield_of_shadows",       // Nekros (shared with Perrin)
      // Saryn
      "venom_dose",              // Saryn (shared with Meridian)
      "regenerative_molt",       // Saryn (shared with Meridian)
      // Titania
      "spellbind",               // Titania — Spellbind augment
      "razorwing_blitz",         // Titania — Razorwing augment
      "tribute",                 // Titania augment
      // Volt
      "electric_shield",         // Volt (shared with Arbiters)
      "capacitance",             // Volt (shared with Arbiters)
      // Zephyr
      "airburst_rounds",         // Zephyr — Tail Wind augment
      "funnel_clouds",           // Zephyr — Tornado augment
      "jet_stream",              // Zephyr — Turbulence augment
    ],
  },

  // ── NEW LOKA ───────────────────────────────────────────────────────────────
  // Weapons: Sequence proc  |  WF augs: Equinox, Gara, Hildryn, Hydroid,
  //   Nezha, Nova, Oberon, Octavia, Protea, Qorvex, Revenant, Wisp, Yareli
  "🌿 New Loka": {
    weapons: [
      "sancti_tigris",
      "sancti_castanas",
      "sancti_magistar",
    ],
    weapon_mods: [
      "lasting_sting",           // Dagger augment   — Sequence proc
      "concentrated_arrow",      // Paris augment    — Sequence proc
      "whirlwind",               // Furis augment    — Sequence proc
      "winds_of_purity",         // Furis set variant (Sancti proc)
    ],
    wf_mods: [
      // Equinox
      "peaceful_provocation",    // Equinox (shared with Arbiters)
      "calm_and_frenzy",         // Equinox (shared with Arbiters)
      // Gara
      "mending_splinters",       // Gara — Shattered Lash augment (Loka variant)
      "splinter_storm",          // Gara augment (newer)
      // Hildryn
      "aegis_storm",             // Hildryn augment
      // Hydroid
      "tempest_barrage",         // Hydroid (shared with Suda)
      "tidal_impunity",          // Hydroid (shared with Suda/Veil)
      // Nezha
      "safeguard",               // Nezha — Warding Halo augment
      "pyroclastic_flow",        // Nezha (shared with Meridian)
      // Nova
      "neutron_star",            // Nova (shared with Suda)
      // Oberon
      "smite_infusion",          // Oberon (shared with Meridian)
      "hallowed_eruption",       // Oberon (shared with Meridian)
      // Octavia
      "partitioned_mallet",      // Octavia (shared with Suda)
      // Protea
      // Revenant
      "blinding_reave",          // Revenant augment
      "reave",                   // Revenant augment (newer)
      // Wisp
      // Yareli
    ],
  },

  // ── ENTRATI (Necramech mods) ───────────────────────────────────────────────
  "🏛 Entrati": {
    weapons: [],
    weapon_mods: [],
    wf_mods: [
      "necramech_continuity",
      "necramech_deflection",
      "necramech_enemy_sense",
      "necramech_friction",
      "necramech_fury",
      "necramech_hydraulics",
      "necramech_intensify",
      "necramech_pressure_point",
      "necramech_redirection",
      "necramech_seismic_wave",
      "necramech_streamline",
      "necramech_stretch",
      "necramech_vitality",
    ],
  },

  // ── CEPHALON SIMARIS ───────────────────────────────────────────────────────
  "🔭 Cephalon Simaris": {
    weapons: [],
    weapon_mods: [],
    wf_mods: [
      "simaris_augment",         // placeholder — Simaris sells Synthesis Scanners, not tradeable augments
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Flatten helper — gives a flat slug array from a syndicate entry
// ─────────────────────────────────────────────────────────────────────────────
function flatSlugs(entry) {
  if (Array.isArray(entry)) return entry;                         // legacy format
  return [
    ...(entry.weapons     ?? []),
    ...(entry.weapon_mods ?? []),
    ...(entry.wf_mods     ?? []),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom Groups CRUD (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

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
  });
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

// ─────────────────────────────────────────────────────────────────────────────
// Syndicate / NPC group endpoints
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/customgroups/npc/list
// Returns syndicate names + counts of items found in local DB.
// Also returns the breakdown (weapons / weapon_mods / wf_mods) per syndicate.
router.get("/npc/list", (req, res) => {
  const db       = getDb();
  const allItems = new Set(db.prepare("SELECT url_name FROM items").all().map(r => r.url_name));

  const result = {};
  for (const [syndicate, entry] of Object.entries(SYNDICATE_ITEMS)) {
    const slugs = flatSlugs(entry);
    const found = slugs.filter(s => allItems.has(s)).length;
    if (found === 0) continue;

    // Return category breakdown too (for richer UI display)
    if (Array.isArray(entry)) {
      result[syndicate] = { total: found, weapons: 0, weapon_mods: 0, wf_mods: found };
    } else {
      result[syndicate] = {
        total:       found,
        weapons:     entry.weapons?.filter(s => allItems.has(s)).length     ?? 0,
        weapon_mods: entry.weapon_mods?.filter(s => allItems.has(s)).length ?? 0,
        wf_mods:     entry.wf_mods?.filter(s => allItems.has(s)).length     ?? 0,
      };
    }
  }
  res.json(result);
});

// GET /api/customgroups/npc/:syndicate?category=wf_mods
// Returns items for one syndicate, optionally filtered to a category.
// category: "weapons" | "weapon_mods" | "wf_mods" | "all" (default)
router.get("/npc/:syndicate", (req, res) => {
  const name     = decodeURIComponent(req.params.syndicate);
  const category = req.query.category ?? "all";
  const entry    = SYNDICATE_ITEMS[name];
  if (!entry) return res.status(404).json({ error: "Syndicate not found" });

  const db = getDb();

  function hydrateSlug(slug) {
    const row = db.prepare("SELECT url_name, item_name FROM items WHERE url_name = ?").get(slug);
    return { url_name: slug, item_name: row?.item_name ?? slug, in_db: !!row };
  }

  if (Array.isArray(entry)) {
    return res.json({ all: entry.map(hydrateSlug) });
  }

  const cats = category === "all"
    ? ["weapons", "weapon_mods", "wf_mods"]
    : [category];

  const result = {};
  for (const cat of cats) {
    if (entry[cat]) result[cat] = entry[cat].map(hydrateSlug);
  }
  res.json(result);
});

// GET /api/customgroups/npc
// Returns all syndicates with all their items, hydrated from DB.
router.get("/npc", (req, res) => {
  const db       = getDb();
  const allItems = db.prepare("SELECT url_name, item_name FROM items").all();
  const bySlug   = Object.fromEntries(allItems.map(i => [i.url_name, i.item_name]));

  const result = {};
  for (const [syndicate, entry] of Object.entries(SYNDICATE_ITEMS)) {
    if (Array.isArray(entry)) {
      const matched = entry
        .filter(s => bySlug[s])
        .map(s => ({ url_name: s, item_name: bySlug[s] }));
      if (matched.length > 0) result[syndicate] = { all: matched };
      continue;
    }
    const hydrated = {};
    let total = 0;
    for (const cat of ["weapons", "weapon_mods", "wf_mods"]) {
      const items = (entry[cat] ?? [])
        .filter(s => bySlug[s])
        .map(s => ({ url_name: s, item_name: bySlug[s] }));
      if (items.length) hydrated[cat] = items;
      total += items.length;
    }
    if (total > 0) result[syndicate] = hydrated;
  }
  res.json(result);
});

export default router;
