import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRecipeTable, parseParts, parseStage, parseRoll, slug, markdownToHtml, STAGES } from "../scripts/recipes.mjs";
import { RECIPES } from "../scripts/recipes-data.mjs";
import {
  AUGMENTS, AUGMENT_RULES, augmentItemId, featureId, keyOfFeature, slotsForTier, shiftRange,
  presetUpdate, weaponFeatureFor
} from "../scripts/ikonis-rules.mjs";
import { SCRAP_ITEMS } from "../scripts/data.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- reading the vault table ---------- */

const SAMPLE = `# Crafting (DH)

## Rezepte

Text before the table.

| Produkt | Art | Stufe | Teile | Wo/Wer | Wurf | Wirkung |
|---|---|---|---|---|---|---|
| Störknall (nachladen) | Verbrauchsgut | Verbrauchsgut | 2 Coil · 1 Wire | Werkbank · Scraphead | Finesse (10) · pro lange Rast | (Consumable) As *Störknall*. |
| Zapfer | Augment | Rar (Tier 2) | 18 Crystal · 6 Battery | Werkbank · Patcher | Finesse (15) · Countdown (3) | You **mark a Stress** & gain a Hope. |

## Verknüpfungen
`;

test("the recipe table of the vault note is read", () => {
  const [a, b] = parseRecipeTable(SAMPLE);
  assert.equal(a.key, "stoerknall-nachladen");
  assert.equal(a.type, "consumable");
  assert.deepEqual(a.roll, { trait: "finesse", dc: 10, countdown: null });
  assert.deepEqual(a.parts, [{ key: "coil", count: 2 }, { key: "wire", count: 1 }]);
  assert.equal(b.type, "augment");
  assert.equal(b.stage, "rare");
  assert.equal(b.tier, 2);
  assert.equal(b.workshop, "patcher");
  assert.equal(b.effect, "<p>You <strong>mark a Stress</strong> &amp; gain a Hope.</p>");
});

test("typos in the table are reported with their line", () => {
  assert.throws(() => parseRecipeTable(SAMPLE.replace("18 Crystal", "18 Kristall")), /line 10: unknown material "Kristall"/);
  assert.throws(() => parseStage("Rar (Tier 3)"), /does not match tier 2/);
  assert.throws(() => parseRoll("Finesse 12"), /cannot read roll/);
  assert.throws(() => parseParts("Coil"), /cannot read part/);
});

test("names become keys and Markdown becomes HTML", () => {
  assert.equal(slug("Spürsender"), "spuersender");
  assert.equal(slug("Störknall (nachladen)"), "stoerknall-nachladen");
  assert.equal(markdownToHtml("**mark a Stress**: *Vulnerable* <x>"), "<p><strong>mark a Stress</strong>: <em>Vulnerable</em> &lt;x&gt;</p>");
});

/* ---------- the generated recipe data ---------- */

test("every recipe uses the 18 scrap pieces and a known stage", () => {
  const keys = new Set(SCRAP_ITEMS.map(i => i.key));
  assert.ok(RECIPES.length > 0);
  for (const r of RECIPES) {
    assert.ok(STAGES[r.stage], r.name);
    for (const p of r.parts) assert.ok(keys.has(p.key) && p.count > 0, `${r.name}: ${p.key}`);
  }
});

test("augment ids are unique Foundry ids and every augment has an icon", () => {
  const ids = AUGMENTS.map(a => augmentItemId(a.key));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[A-Za-z0-9]{16}$/);
  for (const a of AUGMENTS) assert.ok(fs.existsSync(path.join(ROOT, "assets", "icons", "augments", `${a.key}.webp`)), a.key);
});

test("every automation rule belongs to an augment of the table", () => {
  const keys = new Set(AUGMENTS.map(a => a.key));
  for (const key of Object.keys(AUGMENT_RULES)) assert.ok(keys.has(key), key);
});

test("weapon features carry effects, roll modifiers or a Stress cost", () => {
  const force = weaponFeatureFor(AUGMENTS.find(a => a.key === "force"));
  assert.equal(force.effects[0].system.changes[0].key, "system.bonuses.damage.bonus");
  assert.equal(force.effects[0].system.conditionals[0].weaponType, "sameWeapon");
  const block = weaponFeatureFor(AUGMENTS.find(a => a.key === "block"));
  assert.deepEqual(block.effects[0].system.changes.map(c => c.type), ["armor", "add"]);
  assert.deepEqual(weaponFeatureFor(AUGMENTS.find(a => a.key === "amplify")).rollModifiers, ["pw"]);
  assert.deepEqual(weaponFeatureFor(AUGMENTS.find(a => a.key === "kick")).actions[0].cost, [{ key: "stress", value: 2 }]);
  const fix = weaponFeatureFor(AUGMENTS.find(a => a.key === "fix"));
  assert.deepEqual([fix.effects.length, fix.actions.length], [0, 0]);
  // rule data is copied, not shared between features
  force.effects[0].system.changes[0].value = 99;
  assert.equal(weaponFeatureFor(AUGMENTS.find(a => a.key === "force")).effects[0].system.changes[0].value, 1);
});

/* ---------- Ikonis rules ---------- */

test("slots: two at the start, one more per tier", () => {
  assert.deepEqual([1, 2, 3, 4].map(slotsForTier), [2, 3, 4, 5]);
  assert.equal(slotsForTier(undefined), 2);
  assert.equal(slotsForTier(9), 5);
});

test("Scope moves the range one step, never past Very Far", () => {
  assert.equal(shiftRange("melee"), "veryClose");
  assert.equal(shiftRange("close"), "far");
  assert.equal(shiftRange("veryFar"), "veryFar");
  assert.equal(shiftRange("self"), "self");
});

test("feature ids map back to augment keys", () => {
  assert.equal(keyOfFeature(featureId("force")), "force");
  assert.equal(keyOfFeature("bonded"), null);
});

test("Iconic Weapon presets of the Motherboard frame", () => {
  assert.deepEqual(presetUpdate("far", "finesse"), {
    "system.attack.range": "far",
    "system.attack.damage.main.value.dice": "d8",
    "system.attack.damage.main.value.bonus": 1,
    "system.attack.damage.main.value.custom.enabled": false,
    "system.attack.damage.main.type": ["magical"],
    "system.attack.roll.trait": "finesse"
  });
  assert.deepEqual(presetUpdate("", "finesse"), {});
  assert.equal(presetUpdate("melee", "nonsense")["system.attack.roll.trait"], undefined);
});
