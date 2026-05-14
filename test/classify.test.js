import test from "node:test";
import assert from "node:assert/strict";
import { classifyItem } from "../backend/classify.js";
import { getNpcGroupSlugs, getStandingCost } from "../backend/groups.js";

test("classifies common market group types", () => {
  assert.equal(classifyItem("Arcane Energize", "arcane_energize"), "Arcanes");
  assert.equal(classifyItem("Primed Continuity", "primed_continuity"), "Primed Mods");
  assert.equal(classifyItem("Lith A1 Relic", "lith_a1_relic"), "Relics");
});

test("classifies set and part groups consistently", () => {
  assert.equal(classifyItem("Paris Prime Set", "paris_prime_set"), "Primary Sets");
  assert.equal(classifyItem("Nikana Prime Hilt", "nikana_prime_hilt"), "Melee Parts");
  assert.equal(classifyItem("Lex Prime Barrel", "lex_prime_barrel"), "Secondary Parts");
});

test("New Loka group includes current syndicate augment slugs", () => {
  const slugs = getNpcGroupSlugs("NPC: New Loka");
  assert.ok(slugs.includes("loyal_merulina"));
  assert.ok(slugs.includes("mind_freak"));
  assert.ok(slugs.includes("lasting_purity"));
  assert.ok(slugs.includes("energy_transfer"));
  assert.ok(!slugs.includes("lasting_sting"));
});

test("all relay syndicates include broad generated augment sets", () => {
  assert.ok(getNpcGroupSlugs("NPC: Steel Meridian").includes("ironclad_charge"));
  assert.ok(getNpcGroupSlugs("NPC: Arbiters of Hexis").includes("repair_dispensary"));
  assert.ok(getNpcGroupSlugs("NPC: Cephalon Suda").includes("loyal_merulina"));
  assert.ok(getNpcGroupSlugs("NPC: Perrin Sequence").includes("champions_blessing"));
  assert.ok(getNpcGroupSlugs("NPC: Red Veil").includes("ulfruns_endurance"));
});

test("mission and vendor groups exist for non-relay sources", () => {
  assert.ok(getNpcGroupSlugs("Vendor: Mother / Deimos Bounties").includes("saxum_thorax"));
  assert.ok(getNpcGroupSlugs("Vendor: Loid / Necraloid").includes("necramech_vitality"));
  assert.ok(getNpcGroupSlugs("Vendor: Sanctum Anatomica / Cavia").includes("xata_invocation"));
  assert.ok(getNpcGroupSlugs("Vendor: Cephalon Simaris").includes("energy_conversion"));
  assert.ok(getNpcGroupSlugs("Vendor: Cephalon Simaris").includes("war_hilt"));
  assert.ok(getNpcGroupSlugs("Vendor: The Hex / Amir").includes("vesper_77_blueprint"));
  assert.ok(getNpcGroupSlugs("Vendor: The Hex / Eleanor").includes("arcane_bellicose"));
  assert.ok(getNpcGroupSlugs("Vendor: Ostron / Hok").includes("exodia_hunt"));
  assert.ok(getNpcGroupSlugs("Vendor: Solaris United / Rude Zuud").includes("pax_seeker"));
  assert.ok(getNpcGroupSlugs("Vendor: Ventkids / Roky").includes("poppin_vert"));
  assert.ok(getNpcGroupSlugs("Vendor: Ventkids / Roky").includes("kompressa_blueprint"));
  assert.ok(getNpcGroupSlugs("Vendor: The Quills / Onkko").includes("virtuos_strike"));
  assert.ok(getNpcGroupSlugs("Vendor: Vox Solaris / Little Duck").includes("magus_lockdown"));
  assert.ok(getNpcGroupSlugs("Vendor: The Holdfasts / Cavalero").includes("molt_augmented"));
  assert.ok(getNpcGroupSlugs("Vendor: Cavia / Bird 3").includes("melee_influence"));
  assert.ok(getNpcGroupSlugs("Vendor: Duviri / Acrithis").includes("longbow_sharpshot"));
  assert.ok(getNpcGroupSlugs("Vendor: Arbitration Honors").includes("galvanized_chamber"));
});

test("syndicate standing costs are available for scanner efficiency", () => {
  assert.equal(getStandingCost("sancti_tigris"), 125000);
  assert.equal(getStandingCost("loyal_merulina"), 25000);
  assert.equal(getStandingCost("mind_freak"), 25000);
  assert.equal(getStandingCost("energy_conversion"), 100000);
  assert.equal(getStandingCost("looter"), 75000);
  assert.equal(getStandingCost("xoris_blade"), 15000);
  assert.equal(getStandingCost("vesper_77_blueprint"), 15000);
  assert.equal(getStandingCost("reconifex_barrel_blueprint"), 5000);
  assert.equal(getStandingCost("arcane_bellicose"), 7500);
  assert.equal(getStandingCost("exodia_hunt"), 10000);
  assert.equal(getStandingCost("pax_seeker"), 10000);
  assert.equal(getStandingCost("poppin_vert"), 7500);
  assert.equal(getStandingCost("inertia_dampeners"), 12500);
  assert.equal(getStandingCost("kompressa_blueprint"), 25000);
  assert.equal(getStandingCost("virtuos_strike"), 10000);
  assert.equal(getStandingCost("magus_lockdown"), 10000);
  assert.equal(getStandingCost("molt_augmented"), 10000);
  assert.equal(getStandingCost("melee_influence"), 7500);
  assert.equal(getStandingCost("longbow_sharpshot"), null);
  assert.equal(getStandingCost("galvanized_chamber"), null);
  assert.equal(getStandingCost("necramech_vitality"), null);
});
