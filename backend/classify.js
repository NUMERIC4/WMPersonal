// Shared item group classifier — used by scanner.js and profit.js

export function classifyItem(item_name, url_name) {
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