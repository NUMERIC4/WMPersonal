import test from "node:test";
import assert from "node:assert/strict";
import { classifyItem } from "../backend/classify.js";
import { getNpcGroupSlugs } from "../backend/groups.js";

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
});
