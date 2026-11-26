import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RECIPES } from "../scripts/recipes-data.mjs";
import {
  recipe, needsBlueprint, BLUEPRINT_RECIPES, productItemId, blueprintItemId, productIcon, partsFor,
  piecesAffordable, partRows, outcomeOf, nextProgress, consumableResult, startProblem, newProject, countdownBoxes
} from "../scripts/crafting-rules.mjs";
import { augmentItemId } from "../scripts/ikonis-rules.mjs";
import { itemId } from "../scripts/data.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("from Rare on a recipe needs a blueprint", () => {
  assert.equal(needsBlueprint(recipe("zapfer")), true);
  assert.equal(needsBlueprint(recipe("override")), true);
  assert.equal(needsBlueprint(recipe("magnetzug")), false);
  assert.equal(needsBlueprint(recipe("seilwinde")), false);
  assert.ok(BLUEPRINT_RECIPES.every(r => ["rare", "veryRare", "legendary"].includes(r.stage)));
});

test("compendium ids are unique 16-character ids, augments keep theirs", () => {
  const ids = [
    ...RECIPES.map(r => productItemId(r.key)),
    ...BLUEPRINT_RECIPES.map(r => blueprintItemId(r.key)),
    ...["gear", "battery"].map(itemId)
  ];
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[A-Za-z0-9]{16}$/);
  assert.equal(productItemId("force"), augmentItemId("force"));
});

test("every product has a picture", () => {
  for (const r of RECIPES) {
    const file = productIcon(r.key).replace(/^modules\/motherboard-ferrond\//, "");
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${r.key}: ${file}`);
  }
});

test("parts for several pieces and what the inventory is enough for", () => {
  const r = recipe("rohrladung"); // 1 Trigger · 2 Copper · 2 Cobalt · 1 Fuse
  assert.deepEqual(partsFor(r, 3).find(p => p.key === "copper"), { key: "copper", count: 6 });
  const have = { trigger: 5, copper: 4, cobalt: 9, fuse: 3 };
  assert.equal(piecesAffordable(r, have), 2);
  assert.equal(piecesAffordable(r, {}), 0);
  assert.deepEqual(partRows(r, have, 3).filter(row => !row.ok).map(row => row.key), ["copper"]);
});

test("duality results become crafting outcomes", () => {
  assert.equal(outcomeOf({ success: true, isCritical: true, withHope: false }), "critical");
  assert.equal(outcomeOf({ success: true, withHope: true }), "hope");
  assert.equal(outcomeOf({ success: true, withHope: false }), "fear");
  assert.equal(outcomeOf({ success: false, withHope: true }), "failHope");
  assert.equal(outcomeOf({ success: false, withHope: false }), "failFear");
});

test("the progress countdown follows Dynamic Countdowns and stays between 0 and its start", () => {
  assert.equal(nextProgress(2, 2, "hope"), 0);
  assert.equal(nextProgress(3, 3, "critical"), 0);
  assert.equal(nextProgress(1, 3, "critical"), 0);
  assert.equal(nextProgress(2, 2, "fear"), 1);
  assert.equal(nextProgress(2, 2, "failHope"), 2);
  assert.equal(nextProgress(2, 2, "failFear"), 2);
  assert.equal(nextProgress(1, 2, "failFear"), 2);
});

test("consumables: always at least one, tier decides, Fear brings one flawed", () => {
  assert.deepEqual(consumableResult("critical", 1, 10), { made: 3, flawed: 0 });
  assert.deepEqual(consumableResult("hope", 2, 10), { made: 3, flawed: 0 });
  assert.deepEqual(consumableResult("fear", 1, 10), { made: 2, flawed: 1 });
  assert.deepEqual(consumableResult("failHope", 4, 10), { made: 1, flawed: 0 });
  assert.deepEqual(consumableResult("failFear", 1, 10), { made: 1, flawed: 1 });
  assert.deepEqual(consumableResult("critical", 3, 2), { made: 2, flawed: 0 }, "never more than laid out");
  assert.deepEqual(consumableResult("hope", 1, 0), { made: 1, flawed: 0 });
});

test("what stops a project from starting", () => {
  const zapfer = recipe("zapfer");
  const rich = Object.fromEntries(zapfer.parts.map(p => [p.key, 99]));
  assert.equal(startProblem(zapfer, { tier: 1, blueprints: new Set(["zapfer"]), have: rich }), "MBF.Crafting.TierTooLow");
  assert.equal(startProblem(zapfer, { tier: 2, blueprints: new Set(), have: rich }), "MBF.Crafting.NeedsBlueprint");
  assert.equal(startProblem(zapfer, { tier: 2, blueprints: new Set(["zapfer"]), have: {} }), "MBF.Crafting.MissingParts");
  assert.equal(startProblem(zapfer, { tier: 2, blueprints: new Set(["zapfer"]), have: rich }), null);
});

test("a new project starts at the stage's countdown and shows boxes", () => {
  const p = newProject(recipe("magnetzug"), 1);
  assert.deepEqual([p.dc, p.start, p.progress], [12, 2, 2]);
  assert.deepEqual(countdownBoxes({ ...p, progress: 1 }).map(b => b.filled), [true, false]);
});

test("Quick Actions: who took Work on a Project in a long rest", async () => {
  const { quickActionProjectActors, quickActionKeys } = await import("../scripts/crafting-rules.mjs");
  assert.deepEqual(quickActionKeys([{ key: "prepare" }, "workOnProject", null]), ["prepare", "workOnProject"]);
  const state = {
    restType: "long",
    actors: {
      a1: { included: true, actions: [] },
      a2: { included: true, actions: [{ key: "workOnProject" }] },
      a3: { included: false, actions: [{ key: "workOnProject" }] },
      a4: { included: true }
    }
  };
  const flags = { a1: { actions: [{ id: "x", key: "workOnProject", target: null }] }, a4: { actions: ["clearStress"] } };
  assert.deepEqual(quickActionProjectActors(state, id => flags[id]), ["a1", "a2"]);
  assert.deepEqual(quickActionProjectActors({ ...state, restType: "short" }, id => flags[id]), []);
  assert.deepEqual(quickActionProjectActors({}, () => null), []);
});
