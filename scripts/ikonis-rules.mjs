/**
 * Ikonis and augments as plain data and pure functions (no Foundry globals; tests import this).
 *
 * An Ikonis is a weapon bound to its person. It carries the system's own weapon feature
 * "Bonded" (+ level to damage) and grows through augments. Every augment is a Daggerheart weapon
 * feature registered by the module, so the system itself adds and removes its effects and actions.
 * Rules: vault notes "Ikonis", "Crafting (DH)" and the Motherboard frame.
 */
import { MODULE_ID, ICON_PATH } from "./data.mjs";
import { RECIPES } from "./recipes-data.mjs";

/** Loot sub-category of an augment that sits in the inventory (not installed). */
export const AUGMENT_CATEGORY = "ferrond-augment";

/** The system's own weapon feature for Iconic Weapons: damage bonus equal to your level. */
export const BONDED_FEATURE = "bonded";

export const FEATURE_PREFIX = "ferrond-aug-";
export const featureId = key => `${FEATURE_PREFIX}${key}`;
export const keyOfFeature = id => (String(id).startsWith(FEATURE_PREFIX) ? String(id).slice(FEATURE_PREFIX.length) : null);

export const augmentIcon = key => `${ICON_PATH}/augments/${key}.webp`;
export const augmentItemId = key => `mbfAug${key}0000000000000000`.slice(0, 16);

/** All augment recipes from the vault table. */
export const AUGMENTS = RECIPES.filter(r => r.type === "augment");
export const augment = key => AUGMENTS.find(a => a.key === key) ?? null;

/** Slots: two at the start, one more per tier (Motherboard frame). */
export function slotsForTier(tier) {
  const t = Math.min(4, Math.max(1, Math.trunc(Number(tier)) || 1));
  return t + 1;
}

export const RANGES = ["melee", "veryClose", "close", "far", "veryFar"];

/** One range step further, never past Very Far. */
export function shiftRange(range, steps = 1) {
  const n = RANGES.indexOf(range);
  if (n < 0) return range;
  return RANGES[Math.min(RANGES.length - 1, Math.max(0, n + steps))];
}

/**
 * Iconic Weapon stats of the Motherboard frame. Tech damage is the system's "magical" type
 * (the module renames it to Tech).
 */
export const PRESETS = {
  melee: { range: "melee", type: "physical", dice: "d12", bonus: 1 },
  veryClose: { range: "veryClose", type: "physical", dice: "d10", bonus: 2 },
  close: { range: "close", type: "physical", dice: "d10", bonus: 0 },
  far: { range: "far", type: "magical", dice: "d8", bonus: 1 },
  veryFar: { range: "veryFar", type: "magical", dice: "d6", bonus: 1 }
};

export const TRAITS = ["agility", "strength", "finesse", "instinct", "presence", "knowledge"];

/** The weapon update for a preset (paths of Daggerheart 2.12 weapon data). */
export function presetUpdate(presetKey, trait) {
  const p = PRESETS[presetKey];
  if (!p) return {};
  const update = {
    "system.attack.range": p.range,
    "system.attack.damage.main.value.dice": p.dice,
    "system.attack.damage.main.value.bonus": p.bonus,
    "system.attack.damage.main.value.custom.enabled": false,
    "system.attack.damage.main.type": [p.type]
  };
  if (TRAITS.includes(trait)) update["system.attack.roll.trait"] = trait;
  return update;
}

/* -------------------------------------------- */
/*  What each augment does in Foundry           */
/* -------------------------------------------- */

const sameWeapon = { type: "weaponRestriction", weaponType: "sameWeapon" };
const attacksOnly = { type: "actionType", actionTypes: ["attack"] };

const damage = n => ({ conditionals: [sameWeapon], changes: [{ key: "system.bonuses.damage.bonus", type: "add", value: n }] });
const attack = n => ({ conditionals: [sameWeapon, attacksOnly], changes: [{ key: "system.bonuses.roll.bonus", type: "add", value: n }] });
const armor = (n, evasion = 0) => ({
  changes: [
    { type: "armor", value: { max: String(n) } },
    ...(evasion ? [{ key: "system.evasion", type: "add", value: String(evasion) }] : [])
  ]
});

/**
 * Automation per augment. Everything else is the rule text on the weapon.
 *  effect        – an active effect (same shape as the system's weapon features)
 *  rollModifiers – like the SRD feature "Powerful" ("pw": extra damage die, drop the lowest)
 *  stress        – an action on the weapon that pays the Stress and posts the text
 *  rangeStep     – the weapon's range moves one step while installed (Scope)
 */
export const AUGMENT_RULES = {
  force: { effect: damage(1) },
  sear: { effect: damage(2) },
  bury: { effect: damage(3) },
  converge: { effect: attack(1) },
  target: { effect: attack(2) },
  guard: { effect: armor(1) },
  deny: { effect: armor(2) },
  block: { effect: armor(3, -1) },
  absorb: { effect: { changes: [{ key: "system.rules.damageReduction.maxArmorMarked.value", type: "add", value: 1 }] } },
  override: { effect: { conditionals: [sameWeapon, attacksOnly], changes: [{ key: "system.advantageSources", type: "add", value: "Override" }] } },
  amplify: { rollModifiers: ["pw"] },
  scope: { rangeStep: 1 },
  split: { stress: 1 },
  magnetzug: { stress: 1 },
  kick: { stress: 2 },
  follow: { stress: 2 }
};

/** The weapon feature config Daggerheart reads (CONFIG.DH.ITEM.weaponFeatures[featureId(key)]). */
export function weaponFeatureFor(recipe, labelSuffix = "Augment") {
  const rule = AUGMENT_RULES[recipe.key] ?? {};
  const img = augmentIcon(recipe.key);
  const feature = {
    label: `${recipe.name} (${labelSuffix})`,
    description: recipe.effect,
    effects: [],
    actions: []
  };
  if (rule.effect) feature.effects.push({ name: recipe.name, description: recipe.effect, img, system: structuredClone(rule.effect) });
  if (rule.rollModifiers) feature.rollModifiers = [...rule.rollModifiers];
  if (rule.stress) {
    feature.actions.push({
      type: "effect",
      chatDisplay: true,
      name: recipe.name,
      description: recipe.effect,
      img,
      cost: [{ key: "stress", value: rule.stress }]
    });
  }
  return feature;
}

/** Flags on an Ikonis weapon. */
export const IKONIS_FLAGS = {
  ikonis: "ikonis", // true
  addedBonded: "addedBonded", // the module added "Bonded" (removed again when it stops being an Ikonis)
  scopeRange: "scopeRange" // the range before Scope moved it
};

export const flagPath = name => `flags.${MODULE_ID}.${name}`;
