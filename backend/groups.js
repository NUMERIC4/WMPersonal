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

const SYNDICATE_ITEM_COSTS = {
  // Syndicate weapons
  vaykor_hek: 125000,
  vaykor_marelok: 125000,
  vaykor_sydon: 125000,
  telos_boltor: 125000,
  telos_akbolto: 125000,
  telos_boltace: 125000,
  synoid_gammacor: 125000,
  synoid_simulor: 125000,
  synoid_heliocor: 125000,
  secura_penta: 125000,
  secura_dual_cestra: 125000,
  secura_lecta: 125000,
  rakta_ballistica: 125000,
  rakta_cernos: 125000,
  rakta_dark_dagger: 125000,
  sancti_tigris: 125000,
  sancti_castanas: 125000,
  sancti_magistar: 125000,
};

const SIMARIS_COSTS = {
  looter: 75000,
  detect_vulnerability: 75000,
  reawaken: 75000,
  negate: 75000,
  ambush: 75000,
  energy_generator: 75000,
  botanist: 75000,
  energy_conversion: 100000,
  health_conversion: 100000,
  astral_autopsy: 100000,
  simulor_blueprint: 75000,
  heliocor_blueprint: 75000,
  orvius_blueprint: 100000,
  companion_weapon_riven_mod: 100000,
  shedu_blueprint: 100000,
  xoris_blueprint: 100000,
  xoris_blade: 15000,
  xoris_core: 15000,
  xoris_handle: 15000,
  ether_daggers_blueprint: 100000,
  war_hilt: 50000,
  war_blade: 50000,
  broken_scepter_blueprint: 100000,
  nataruk: 100000,
  sirocco: 100000,
  rumblejack: 100000,
  sun_and_moon: 100000,
  syam: 100000,
  sampotes: 100000,
  edun: 100000,
  azothane: 100000,
};

const HEX_STANDING_COSTS = {
  // Amir Beckett
  cyte_09_chassis_blueprint: 20000,
  cyte_09_neuroptics_blueprint: 20000,
  cyte_09_systems_blueprint: 20000,
  cyte_09_blueprint: 50000,
  ax_52_blueprint: 30000,
  vesper_77_blueprint: 15000,
  vesper_77_barrel_blueprint: 5000,
  vesper_77_receiver_blueprint: 5000,
  vesper_77_handle_blueprint: 5000,
  reconifex_blueprint: 15000,
  reconifex_barrel_blueprint: 5000,
  reconifex_receiver_blueprint: 5000,
  reconifex_stock_blueprint: 5000,

  // Eleanor Nightingale
  primary_crux: 7500,
  melee_doughty: 7500,
  arcane_camisado: 7500,
  arcane_impetus: 7500,
  arcane_truculence: 7500,
  arcane_bellicose: 7500,
  secondary_enervate: 7500,
  arcane_crepuscular: 7500,
};

const OSTRON_HOK_COSTS = {
  exodia_brave: 10000,
  exodia_force: 10000,
  exodia_hunt: 10000,
  exodia_might: 10000,
  exodia_triumph: 10000,
  exodia_valor: 10000,
};

const SOLARIS_RUDE_ZUUD_COSTS = {
  pax_bolt: 10000,
  pax_charge: 10000,
  pax_seeker: 10000,
  pax_soar: 10000,
};

const VENTKIDS_ROKY_COSTS = {
  air_time: 7500,
  trail_blazer: 7500,
  mag_locks: 7500,
  rail_guards: 7500,
  poppin_vert: 7500,
  pop_top: 7500,
  perfect_balance: 7500,
  kinetic_friction: 12500,
  venerdo_hoverdrive: 12500,
  inertia_dampeners: 12500,
  slay_board: 12500,
  cold_arrival: 15000,
  mad_stack: 15000,
  quick_escape: 15000,
  sonic_boost: 20000,
  extreme_velocity: 20000,
  nitro_boost: 20000,
  thrash_landing: 20000,
  vapor_trail: 20000,
  primo_flair: 20000,
  juice: 20000,
  bomb_the_landin: 20000,
  kompressa_blueprint: 25000,
  kompressa_barrel_blueprint: 25000,
  kompressa_receiver_blueprint: 25000,
};

const QUILLS_ONKKO_COSTS = Object.fromEntries([
  "magus_cadence",
  "magus_cloud",
  "magus_elevate",
  "magus_nourish",
  "magus_replenish",
  "magus_vigor",
  "magus_husk",
  "virtuos_fury",
  "virtuos_ghost",
  "virtuos_null",
  "virtuos_shadow",
  "virtuos_strike",
  "virtuos_tempo",
].map(itemSlug => [itemSlug, 10000]));

const VOX_SOLARIS_COSTS = Object.fromEntries([
  "magus_accelerant",
  "magus_anomaly",
  "magus_destruct",
  "magus_drive",
  "magus_firewall",
  "magus_glitch",
  "magus_lockdown",
  "magus_melt",
  "magus_overload",
  "magus_revert",
  "magus_repair",
  "virtuos_forge",
  "virtuos_spike",
  "virtuos_surge",
  "virtuos_trojan",
].map(itemSlug => [itemSlug, 10000]));

const HOLDFASTS_CAVALERO_COSTS = Object.fromEntries([
  "molt_augmented",
  "molt_efficiency",
  "molt_reconstruct",
  "molt_vigor",
  "eternal_eradicate",
  "eternal_logistics",
  "eternal_onslaught",
  "cascadia_accuracy",
  "cascadia_empowered",
  "cascadia_flare",
  "cascadia_overcharge",
].map(itemSlug => [itemSlug, 10000]));

const CAVIA_BIRD3_COSTS = {
  melee_retaliation: 5000,
  melee_fortification: 5000,
  melee_exposure: 7500,
  melee_influence: 7500,
  melee_animosity: 7500,
  melee_vortex: 7500,
};

const DUVIRI_ACRITHIS_ARCANES = [
  "arcane_intention",
  "arcane_power_ramp",
  "primary_blight",
  "primary_exhilarate",
  "primary_obstruct",
  "shotgun_vendetta",
  "akimbo_slip_shot",
  "secondary_outburst",
  "magus_aggress",
  "arcane_reaper",
  "longbow_sharpshot",
  "secondary_shiver",
];

const ARBITRATION_HONORS = [
  "adaptation",
  "rolling_guard",
  "galvanized_acceleration",
  "galvanized_aptitude",
  "galvanized_chamber",
  "galvanized_crosshairs",
  "galvanized_diffusion",
  "galvanized_hell",
  "galvanized_savvy",
  "galvanized_scope",
  "galvanized_shot",
];

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
  "Vendor: Cephalon Simaris": Object.keys(SIMARIS_COSTS),
  "Vendor: Ostron / Hok": Object.keys(OSTRON_HOK_COSTS),
  "Vendor: Solaris United / Rude Zuud": Object.keys(SOLARIS_RUDE_ZUUD_COSTS),
  "Vendor: Ventkids / Roky": Object.keys(VENTKIDS_ROKY_COSTS),
  "Vendor: The Quills / Onkko": Object.keys(QUILLS_ONKKO_COSTS),
  "Vendor: Vox Solaris / Little Duck": Object.keys(VOX_SOLARIS_COSTS),
  "Vendor: The Holdfasts / Cavalero": Object.keys(HOLDFASTS_CAVALERO_COSTS),
  "Vendor: Cavia / Bird 3": Object.keys(CAVIA_BIRD3_COSTS),
  "Vendor: Duviri / Acrithis": DUVIRI_ACRITHIS_ARCANES,
  "Vendor: Arbitration Honors": ARBITRATION_HONORS,
  "Vendor: The Hex / Amir": [
    "cyte_09_chassis_blueprint",
    "cyte_09_neuroptics_blueprint",
    "cyte_09_systems_blueprint",
    "cyte_09_blueprint",
    "ax_52_blueprint",
    "vesper_77_blueprint",
    "vesper_77_barrel_blueprint",
    "vesper_77_receiver_blueprint",
    "vesper_77_handle_blueprint",
    "reconifex_blueprint",
    "reconifex_barrel_blueprint",
    "reconifex_receiver_blueprint",
    "reconifex_stock_blueprint",
  ],
  "Vendor: The Hex / Eleanor": [
    "primary_crux",
    "melee_doughty",
    "arcane_camisado",
    "arcane_impetus",
    "arcane_truculence",
    "arcane_bellicose",
    "secondary_enervate",
    "arcane_crepuscular",
  ],
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

function buildSyndicateCostMap() {
  const costs = { ...SYNDICATE_ITEM_COSTS };
  for (const groupSlugs of Object.values(SYNDICATE_BASE)) {
    for (const itemSlug of groupSlugs) {
      if (!costs[itemSlug]) costs[itemSlug] = 25000;
    }
  }
  for (const [augmentNames] of WARFRAME_AUGMENTS) {
    for (const itemSlug of slugs(augmentNames)) costs[itemSlug] = 25000;
  }
  Object.assign(costs, SIMARIS_COSTS);
  Object.assign(costs, HEX_STANDING_COSTS);
  Object.assign(costs, OSTRON_HOK_COSTS);
  Object.assign(costs, SOLARIS_RUDE_ZUUD_COSTS);
  Object.assign(costs, VENTKIDS_ROKY_COSTS);
  Object.assign(costs, QUILLS_ONKKO_COSTS);
  Object.assign(costs, VOX_SOLARIS_COSTS);
  Object.assign(costs, HOLDFASTS_CAVALERO_COSTS);
  Object.assign(costs, CAVIA_BIRD3_COSTS);
  return costs;
}

const SYNDICATE_COSTS = buildSyndicateCostMap();

export function customGroupLabel(name) {
  return `Custom: ${name}`;
}

export function getNpcGroupSlugs(label) {
  return [...(NPC_GROUPS[label] ?? [])];
}

export function getStandingCost(url_name) {
  return SYNDICATE_COSTS[url_name] ?? null;
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
  const items = db.prepare("SELECT item_name, url_name, max_rank FROM items").all()
    .map(item => ({ ...item, standing_cost: getStandingCost(item.url_name) }));

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
