import { getDb } from "./db.js";
import { classifyItem } from "./classify.js";

const SYNDICATES = {
  steel: "NPC: Steel Meridian",
  hexis: "NPC: Arbiters of Hexis",
  suda: "NPC: Cephalon Suda",
  perrin: "NPC: Perrin Sequence",
  veil: "NPC: Red Veil",
  loka: "NPC: New Loka",
};

function slug(name) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function slugs(names) {
  return names.map(slug);
}

const SYNDICATE_BASE = {
  [SYNDICATES.steel]: [
    "vaykor_hek","vaykor_marelok","vaykor_sydon",
    "justice_blades","scattered_justice","shattering_justice","neutralizing_justice",
  ],
  [SYNDICATES.hexis]: [
    "telos_boltor","telos_akbolto","telos_boltace",
    "blade_of_truth","gilded_truth","stinging_truth","avenging_truth",
  ],
  [SYNDICATES.suda]: [
    "synoid_gammacor","synoid_simulor","synoid_heliocor",
    "entropy_burst","entropy_flight","entropy_spike","entropy_detonation",
  ],
  [SYNDICATES.perrin]: [
    "secura_penta","secura_dual_cestra","secura_lecta",
    "deadly_sequence","sequence_burn","toxic_sequence","voltage_sequence",
  ],
  [SYNDICATES.veil]: [
    "rakta_ballistica","rakta_cernos","rakta_dark_dagger",
    "eroding_blight","gleaming_blight","toxic_blight","stockpiled_blight",
  ],
  [SYNDICATES.loka]: [
    "sancti_tigris","sancti_castanas","sancti_magistar",
    "bright_purity","lasting_purity","winds_of_purity","disarming_purity",
  ],
};

const WARFRAME_AUGMENTS = [
  [["Seeking Shuriken","Smoke Shadow","Teleport Rush","Fatal Teleport","Rising Storm"], [SYNDICATES.hexis, SYNDICATES.veil]],
  [["Rubble Heap","Path of Statues","Tectonic Fracture","Ore Gaze","Rumbled","Titanic Rumbler"], [SYNDICATES.steel, SYNDICATES.veil]],
  [["Sonic Fracture","Resonance","Savage Silence","Resonating Quake"], [SYNDICATES.suda, SYNDICATES.perrin]],
  [["Elusive Retribution","Endless Lullaby","Reactive Storm"], [SYNDICATES.hexis, SYNDICATES.loka]],
  [["Razor Mortar"], [SYNDICATES.suda, SYNDICATES.perrin]],
  [["Afterburn","Everlasting Ward","Guardian Armor","Vexing Retaliation","Guided Effigy"], [SYNDICATES.suda, SYNDICATES.perrin]],
  [["Prismatic Companion","Recrystalize"], [SYNDICATES.steel, SYNDICATES.veil]],
  [["Spectral Spirit"], [SYNDICATES.veil, SYNDICATES.perrin]],
  [["Fireball Frenzy","Immolated Radiance","Healing Flame","Exothermic"], [SYNDICATES.steel, SYNDICATES.veil]],
  [["Duality","Calm and Frenzy","Calm & Frenzy","Peaceful Provocation","Energy Transfer"], [SYNDICATES.hexis, SYNDICATES.loka]],
  [["Surging Dash","Radiant Finish","Furious Javelin","Chromatic Blade"], [SYNDICATES.hexis, SYNDICATES.steel]],
  [["Warriors Rest","Warrior's Rest"], [SYNDICATES.hexis, SYNDICATES.veil]],
  [["Biting Frost","Freeze Force","Ice Wave Impedance","Chilling Globe","Icy Avalanche"], [SYNDICATES.suda, SYNDICATES.steel]],
  [["Shattered Storm","Mending Splinters","Spectrosiphon"], [SYNDICATES.hexis, SYNDICATES.loka]],
  [["Dread Ward","Blood Forge","Blending Talons"], [SYNDICATES.steel, SYNDICATES.veil]],
  [["Mach Crash","Thermal Transfer"], [SYNDICATES.hexis, SYNDICATES.perrin]],
  [["Gourmand","Hearty Nourishment","Catapult","Gastro"], [SYNDICATES.steel, SYNDICATES.veil]],
  [["Coil Recharge","Cathode Current","Conductive Sphere"], [SYNDICATES.hexis, SYNDICATES.perrin]],
  [["Tribunal","Warding Thurible","Lasting Covenant"], [SYNDICATES.hexis, SYNDICATES.veil]],
  [["Balefire Surge","Blazing Pillage","Aegis Gale"], [SYNDICATES.suda, SYNDICATES.perrin]],
  [["Viral Tempest","Tidal Impunity","Rousing Plunder","Pilfering Swarm"], [SYNDICATES.suda, SYNDICATES.loka]],
  [["Elemental Sandstorm","Negation Armor","Desiccations Curse","Desiccation's Curse"], [SYNDICATES.hexis, SYNDICATES.perrin]],
  [["Empowered Quiver","Piercing Navigator","Infiltrate","Concentrated Arrow"], [SYNDICATES.suda, SYNDICATES.perrin]],
  [["Jades Judgment","Jade's Judgment"], [SYNDICATES.hexis, SYNDICATES.veil]],
  [["Accumulating Whipclaw","Venari Bodyguard","Pilfering Strangledome"], [SYNDICATES.steel, SYNDICATES.veil]],
  [["Omikujis Fortune","Omikuji's Fortune"], [SYNDICATES.hexis, SYNDICATES.loka]],
  [["Volatile Recompense","Wrath of Ukko"], [SYNDICATES.steel, SYNDICATES.loka]],
  [["Valence Formation","Swift Bite"], [SYNDICATES.loka, SYNDICATES.veil]],
  [["Rift Haven","Rift Torrent","Cataclysmic Continuum"], [SYNDICATES.hexis, SYNDICATES.suda]],
  [["Savior Decoy","Hushed Invisibility","Safeguard Switch","Irradiating Disarm","Damage Decoy"], [SYNDICATES.hexis, SYNDICATES.veil]],
  [["Greedy Pull","Magnetized Discharge","Counter Pulse","Fracturing Crush"], [SYNDICATES.loka, SYNDICATES.perrin]],
  [["Ballistic Bullseye","Muzzle Flash","Staggering Shield","Mesas Waltz","Mesa's Waltz"], [SYNDICATES.steel, SYNDICATES.veil]],
  [["Hall of Malevolence","Explosive Legerdemain","Total Eclipse"], [SYNDICATES.hexis, SYNDICATES.suda]],
  [["Soul Survivor","Creeping Terrify","Despoil","Shield of Shadows"], [SYNDICATES.veil, SYNDICATES.perrin]],
  [["Pyroclastic Flow","Reaping Chakram","Safeguard","Controlled Slide","Divine Retribution"], [SYNDICATES.suda, SYNDICATES.steel]],
  [["Abundant Mutation","Teeming Virulence","Larva Burst","Parasitic Vitality","Insatiable"], [SYNDICATES.steel, SYNDICATES.perrin]],
  [["Neutron Star","Antimatter Absorb","Escape Velocity","Molecular Fission"], [SYNDICATES.suda, SYNDICATES.steel]],
  [["Mind Freak","Pacifying Bolts","Chaos Sphere","Assimilate"], [SYNDICATES.hexis, SYNDICATES.loka]],
  [["Smite Infusion","Hallowed Eruption","Phoenix Renewal","Hallowed Reckoning"], [SYNDICATES.steel, SYNDICATES.loka]],
  [["Partitioned Mallet","Conductor"], [SYNDICATES.suda, SYNDICATES.loka]],
  [["Repair Dispensary","Temporal Erosion","Temporal Artillery"], [SYNDICATES.hexis, SYNDICATES.perrin]],
  [["Wrecking Wall","Fused Crucible"], [SYNDICATES.suda, SYNDICATES.steel]],
  [["Thrall Pact","Mesmer Shield","Blinding Reave"], [SYNDICATES.suda, SYNDICATES.perrin]],
  [["Ironclad Charge","Iron Shrapnel","Piercing Roar","Reinforcing Stomp"], [SYNDICATES.steel, SYNDICATES.perrin]],
  [["Revealing Spores","Venom Dose","Regenerative Molt","Contagion Cloud"], [SYNDICATES.steel, SYNDICATES.veil]],
  [["Shadow Haze","Dark Propagation"], [SYNDICATES.suda, SYNDICATES.perrin]],
  [["Axios Javelineers","Intrepid Stand"], [SYNDICATES.hexis, SYNDICATES.loka]],
  [["Spellbound Harvest","Beguiling Lantern","Razorwing Blitz","Ironclad Flight"], [SYNDICATES.veil, SYNDICATES.loka]],
  [["Pool of Life","Vampire Leech","Abating Link","Champions Blessing","Champion's Blessing"], [SYNDICATES.loka, SYNDICATES.perrin]],
  [["Swing Line","Eternal War","Prolonged Paralysis","Enraged","Hysterical Assault"], [SYNDICATES.loka, SYNDICATES.perrin]],
  [["Tesla Bank","Photon Repeater","Repelling Bastille"], [SYNDICATES.suda, SYNDICATES.perrin]],
  [["Shock Trooper","Shocking Speed","Transistor Shield","Capacitance"], [SYNDICATES.hexis, SYNDICATES.veil]],
  [["Prey of Dynar","Ulfruns Endurance","Ulfrun's Endurance"], [SYNDICATES.steel, SYNDICATES.veil]],
  [["Fused Reservoir","Critical Surge","Cataclysmic Gate"], [SYNDICATES.suda, SYNDICATES.loka]],
  [["Celestial Stomp","Enveloping Cloud","Primal Rage"], [SYNDICATES.hexis, SYNDICATES.loka]],
  [["Vampiric Grasp","The Relentless Lost"], [SYNDICATES.suda, SYNDICATES.steel]],
  [["Merulina Guardian","Loyal Merulina","Surging Blades"], [SYNDICATES.suda, SYNDICATES.loka]],
  [["Target Fixation","Airburst Rounds","Jet Stream","Funnel Clouds","Anchored Glide"], [SYNDICATES.veil, SYNDICATES.loka]],
];

const VENDOR_BASE = {
  "Vendor: Mother / Deimos Bounties": slugs([
    "Carnis Carapace","Carnis Mandible","Carnis Stinger",
    "Jugulus Barbs","Jugulus Carapace","Jugulus Spines",
    "Saxum Carapace","Saxum Spittle","Saxum Thorax",
    "Motus Setup","Motus Signal","Motus Impact",
  ]),
  "Vendor: Loid / Necraloid": [
    "necramech_blitz","necramech_continuity","necramech_deflection","necramech_drift",
    "necramech_enemy_sense","necramech_friction","necramech_fury","necramech_hydraulics",
    "necramech_intensify","necramech_pressure_point","necramech_rage","necramech_rebuke",
    "necramech_refuel","necramech_redirection","necramech_repair","necramech_seismic_wave",
    "necramech_slipstream","necramech_steel_fiber","necramech_streamline","necramech_stretch",
    "necramech_thrusters","necramech_vitality",
  ],
  "Vendor: Sanctum Anatomica / Cavia": slugs([
    "Jahu Canticle","Khra Canticle","Lohk Canticle","Netra Invocation",
    "Ris Invocation","Vome Invocation","Xata Invocation","Fass Invocation",
    "Melee Animosity","Melee Exposure","Melee Fortification","Melee Influence",
    "Melee Retaliation","Melee Vortex",
  ]),
  "Vendor: Cetus / Plains Bounties": slugs([
    "Augur Accord","Augur Message","Augur Pact","Augur Reach","Augur Secrets","Augur Seeker",
    "Gladiator Aegis","Gladiator Finesse","Gladiator Might","Gladiator Resolve","Gladiator Rush","Gladiator Vice",
    "Vigilante Armaments","Vigilante Fervor","Vigilante Offense","Vigilante Pursuit","Vigilante Supplies","Vigilante Vigor",
    "Hunter Adrenaline","Hunter Command","Hunter Munitions","Hunter Recovery","Hunter Synergy","Hunter Track",
  ]),
  "Vendor: Fortuna / Orb Vallis Bounties": slugs([
    "Synth Charge","Synth Deconstruct","Synth Fiber","Synth Reflex",
    "Mecha Empowered","Mecha Overdrive","Mecha Pulse","Mecha Recharge",
    "Tek Assault","Tek Collateral","Tek Enhance","Tek Gravity",
    "Proton Jet","Proton Pulse","Proton Snap",
  ]),
  "Vendor: Zariman / Holdfasts": slugs([
    "Emergence Dissipate","Emergence Renewed","Emergence Savior",
    "Molt Augmented","Molt Efficiency","Molt Reconstruct","Molt Vigor",
  ]),
  "Vendor: Nightwave": slugs([
    "Deadly Maneuvers","Dizzying Rounds","Double Tap","Efficient Beams",
    "Meticulous Aim","Napalm Grenades","Skull Shots","Wild Frenzy",
  ]),
  "Vendor: Kahl's Garrison / Chipper": slugs([
    "Archon Continuity","Archon Flow","Archon Intensify","Archon Stretch","Archon Vitality",
  ]),
};

function buildNpcGroups() {
  const groups = Object.fromEntries(
    Object.entries(SYNDICATE_BASE).map(([label, groupSlugs]) => [label, [...groupSlugs]])
  );

  for (const [augmentNames, labels] of WARFRAME_AUGMENTS) {
    for (const label of labels) groups[label].push(...slugs(augmentNames));
  }

  return Object.fromEntries(
    [...Object.entries(groups), ...Object.entries(VENDOR_BASE)]
      .map(([label, groupSlugs]) => [label, [...new Set(groupSlugs)]])
  );
}

const NPC_GROUPS = buildNpcGroups();

export function customGroupLabel(name) {
  return `Custom: ${name}`;
}

export function getNpcGroupSlugs(label) {
  return [...(NPC_GROUPS[label] ?? [])];
}

export function listGroupCounts() {
  const db = getDb();
  const items = db.prepare("SELECT item_name, url_name FROM items").all();
  const allSlugs = new Set(items.map(i => i.url_name));
  const counts = { "All Items": items.length };

  for (const item of items) {
    const group = classifyItem(item.item_name, item.url_name);
    if (group) counts[group] = (counts[group] ?? 0) + 1;
  }

  const customGroups = db.prepare(
    "SELECT cg.name, COUNT(cgi.url_name) as cnt " +
    "FROM custom_groups cg " +
    "LEFT JOIN custom_group_items cgi ON cgi.group_id = cg.id " +
    "GROUP BY cg.id HAVING cnt > 0"
  ).all();
  for (const group of customGroups) counts[customGroupLabel(group.name)] = group.cnt;

  for (const [label, groupSlugs] of Object.entries(NPC_GROUPS)) {
    const found = groupSlugs.filter(itemSlug => allSlugs.has(itemSlug)).length;
    if (found > 0) counts[label] = found;
  }

  return counts;
}

export function getItemsForGroup(group = "All Items") {
  const db = getDb();
  const items = db.prepare("SELECT item_name, url_name, max_rank FROM items").all();

  if (group === "All Items") return items;

  if (group.startsWith("Custom: ")) {
    const name = group.slice("Custom: ".length);
    const row = db.prepare("SELECT id FROM custom_groups WHERE name = ?").get(name);
    if (!row) return [];
    const groupSlugs = new Set(
      db.prepare("SELECT url_name FROM custom_group_items WHERE group_id = ?").all(row.id).map(r => r.url_name)
    );
    return items.filter(item => groupSlugs.has(item.url_name));
  }

  if (group.startsWith("NPC: ") || group.startsWith("Vendor: ")) {
    const groupSlugs = new Set(NPC_GROUPS[group] ?? []);
    return items.filter(item => groupSlugs.has(item.url_name));
  }

  return items.filter(item => classifyItem(item.item_name, item.url_name) === group);
}
