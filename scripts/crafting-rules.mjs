/**
 * Crafting rules as plain data and pure functions (no Foundry globals; tests import this).
 * Vault: "Crafting (DH)" and "Foundry-Modul Motherboard Ferrond — Crafting und Harvesting".
 */
import { ICON_PATH } from "./data.mjs";
import { RECIPES } from "./recipes-data.mjs";
import { STAGES } from "./recipes.mjs";
import { augmentItemId } from "./ikonis-rules.mjs";

export const recipe = key => RECIPES.find(r => r.key === key) ?? null;

/** Loot sub-categories of crafted things that are not augments or consumables. */
export const DEVICE_CATEGORY = "ferrond-device";
export const ARMOR_PART_CATEGORY = "ferrond-armor-part";
export const BLUEPRINT_CATEGORY = "ferrond-blueprint";

/** From Rare on you need a blueprint (vault: "ab Rar braucht man einen Bauplan"). */
export const BLUEPRINT_STAGES = ["rare", "veryRare", "legendary"];
export const needsBlueprint = r => BLUEPRINT_STAGES.includes(r?.stage);
export const BLUEPRINT_RECIPES = RECIPES.filter(needsBlueprint);

/* -------------------------------------------- */
/*  Ids and icons                               */
/* -------------------------------------------- */

const alnum = key => String(key).replace(/[^A-Za-z0-9]/g, "");
const id16 = (prefix, key) => `${prefix}${alnum(key)}0000000000000000`.slice(0, 16);

/** Compendium id of the finished product (augments keep their own ids). */
export function productItemId(key) {
  const r = recipe(key);
  return r?.type === "augment" ? augmentItemId(key) : id16("mbfC", key);
}
export const blueprintItemId = key => id16("mbfB", key);

/** "Störknall (nachladen)" is the same thing as "Störknall" and shares its picture. */
const ICON_ALIASES = { "stoerknall-nachladen": "stoerknall" };
export function productIcon(key) {
  const r = recipe(key);
  if (r?.type === "augment") return `${ICON_PATH}/augments/${key}.webp`;
  return `${ICON_PATH}/crafting/${ICON_ALIASES[key] ?? key}.webp`;
}
export const BLUEPRINT_ICON = `${ICON_PATH}/crafting/bauplan.webp`;

/* -------------------------------------------- */
/*  Materials                                   */
/* -------------------------------------------- */

/** Parts for `times` pieces: [{ key, count }]. */
export function partsFor(r, times = 1) {
  return r.parts.map(p => ({ key: p.key, count: p.count * times }));
}

/** How many pieces the inventory ({ coil: 5, … }) is enough for. */
export function piecesAffordable(r, have) {
  return Math.min(...r.parts.map(p => Math.floor((have[p.key] ?? 0) / p.count)));
}

/** Rows for the window: { key, need, have, ok }. */
export function partRows(r, have, times = 1) {
  return partsFor(r, times).map(p => ({ key: p.key, need: p.count, have: have[p.key] ?? 0, ok: (have[p.key] ?? 0) >= p.count }));
}

export const hasParts = (r, have, times = 1) => partRows(r, have, times).every(row => row.ok);

/* -------------------------------------------- */
/*  Rolls                                       */
/* -------------------------------------------- */

/** "critical" | "hope" | "fear" | "failHope" | "failFear" from a Daggerheart duality roll. */
export function outcomeOf({ success, isCritical, withHope }) {
  if (isCritical) return "critical";
  if (success) return withHope ? "hope" : "fear";
  return withHope ? "failHope" : "failFear";
}

/** Dynamic Countdowns (SRD): how far the progress countdown moves. */
export const COUNTDOWN_STEP = { critical: -3, hope: -2, fear: -1, failHope: 0, failFear: 1 };

/** New countdown value: never below 0, never above its start. */
export function nextProgress(progress, start, outcome) {
  return Math.min(start, Math.max(0, progress + COUNTDOWN_STEP[outcome]));
}

/**
 * Consumables: how many are made in one long rest, and how many of them are flawed.
 * Always at least one; never more than the pieces the parts were laid out for (max).
 */
export function consumableResult(outcome, tier, max) {
  const t = Math.min(4, Math.max(1, Math.trunc(Number(tier)) || 1));
  const upTo = { critical: t + 2, hope: t + 1, fear: t + 1, failHope: 1, failFear: 1 }[outcome];
  const made = Math.max(1, Math.min(upTo, Math.max(1, Math.trunc(max) || 1)));
  const flawed = outcome === "fear" || outcome === "failFear" ? 1 : 0;
  return { made, flawed };
}

/* -------------------------------------------- */
/*  Projects                                    */
/* -------------------------------------------- */

/** Can this character start the recipe? Returns a language key or null. */
export function startProblem(r, { tier, blueprints, have, times = 1 }) {
  if (!r) return "MBF.Crafting.UnknownRecipe";
  if ((tier ?? 1) < r.tier) return "MBF.Crafting.TierTooLow";
  if (needsBlueprint(r) && !blueprints.has(r.key)) return "MBF.Crafting.NeedsBlueprint";
  if (!hasParts(r, have, times)) return "MBF.Crafting.MissingParts";
  return null;
}

/** A new countdown project (not for consumables). */
export function newProject(r, now = Date.now()) {
  const start = STAGES[r.stage].countdown ?? 1;
  return { key: r.key, dc: r.roll.dc ?? STAGES[r.stage].dc, start, progress: start, parts: partsFor(r), started: now };
}

/** Countdown boxes for the window: filled = already ticked down. */
export function countdownBoxes(project) {
  return Array.from({ length: project.start }, (_, n) => ({ filled: n < project.start - project.progress }));
}

/* -------------------------------------------- */
/*  "Daggerheart: Quick Actions" long rests      */
/* -------------------------------------------- */

const QA_WORK_ON_A_PROJECT = "workOnProject";

/** Move keys of a Quick Actions choice list (current shape: [{ key }], old shape: ["key"]). */
export function quickActionKeys(list) {
  return Array.isArray(list) ? list.map(a => (typeof a === "string" ? a : a?.key)).filter(Boolean) : [];
}

/**
 * Characters that took "Work on a Project" in a finished Quick Actions long rest.
 * state = the setting "downtimeUIState"; choicesOf(actorId) = the owner's "downtimeChoices" flag.
 */
export function quickActionProjectActors(state, choicesOf) {
  if (state?.restType !== "long" || !state.actors) return [];
  return Object.entries(state.actors)
    .filter(([, gm]) => gm?.included)
    .filter(([id, gm]) => [...quickActionKeys(gm.actions), ...quickActionKeys(choicesOf(id)?.actions)].includes(QA_WORK_ON_A_PROJECT))
    .map(([id]) => id);
}
