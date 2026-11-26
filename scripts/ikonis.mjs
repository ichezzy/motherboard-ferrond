/**
 * Ikonis: make a weapon an Ikonis (GM), install and remove augments (its owner).
 *
 * Everything runs on the acting client: a player owns their character, its weapons and items.
 * Installing and removing post a chat line, so the GM sees when augments are swapped
 * (the rule: swap during downtime).
 */
import { MODULE_ID } from "./data.mjs";
import { esc } from "./gm.mjs";
import {
  BONDED_FEATURE, IKONIS_FLAGS, AUGMENT_RULES, augment, featureId, keyOfFeature, flagPath,
  slotsForTier, shiftRange, presetUpdate
} from "./ikonis-rules.mjs";
import { augmentKeyOf, addAugmentItem, takeAugmentItem } from "./augments.mjs";

const L = key => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);

export const ikonisName = () => L("MBF.Ikonis.Name");

export function isIkonis(weapon) {
  return weapon?.type === "weapon" && Boolean(weapon.getFlag(MODULE_ID, IKONIS_FLAGS.ikonis));
}

/** The character the weapon belongs to, or null. */
export function ownerOf(weapon) {
  const actor = weapon?.parent;
  return actor?.documentName === "Actor" ? actor : null;
}

export function slotCount(weapon) {
  const actor = ownerOf(weapon);
  return slotsForTier(actor?.type === "character" ? actor.system.tier : 1);
}

/** Keys of the installed augments, in install order. */
export function installedKeys(weapon) {
  return Object.keys(weapon?.system?.itemFeatures ?? {}).map(keyOfFeature).filter(k => k && augment(k));
}

/** Augment items in the owner's inventory that are not installed in this weapon yet. */
export function availableAugments(weapon) {
  const actor = ownerOf(weapon);
  if (!actor) return [];
  const installed = new Set(installedKeys(weapon));
  return actor.items.filter(i => {
    const key = augmentKeyOf(i);
    return key && !installed.has(key) && (i.system.quantity ?? 1) > 0;
  });
}

async function chat(weapon, text) {
  const actor = ownerOf(weapon);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="mbf-ikonis-chat"><i class="fa-solid fa-microchip"></i> ${text}</p>`
  });
}

/* -------------------------------------------- */
/*  GM: make an Ikonis                          */
/* -------------------------------------------- */

/** preset: key of PRESETS or "" (keep the weapon's stats). */
export async function makeIkonis(weapon, { preset = "", trait = "" } = {}) {
  if (!game.user.isGM) throw new Error(L("MBF.GM.OnlyGM"));
  const hasBonded = BONDED_FEATURE in (weapon.system.itemFeatures ?? {});
  const update = {
    [flagPath(IKONIS_FLAGS.ikonis)]: true,
    [flagPath(IKONIS_FLAGS.addedBonded)]: !hasBonded,
    ...presetUpdate(preset, trait)
  };
  if (!hasBonded) update[`system.itemFeatures.${BONDED_FEATURE}`] = { value: BONDED_FEATURE };
  await weapon.update(update);
  const actor = ownerOf(weapon);
  await chat(weapon, F(actor ? "MBF.Ikonis.MadeChat" : "MBF.Ikonis.MadeChatNoOwner", {
    weapon: esc(weapon.name), actor: esc(actor?.name ?? ""), ikonis: esc(ikonisName())
  }));
}

/** Back to an ordinary weapon: augments go back into the inventory. */
export async function unmakeIkonis(weapon) {
  if (!game.user.isGM) throw new Error(L("MBF.GM.OnlyGM"));
  for (const key of installedKeys(weapon)) await removeAugment(weapon, key, { silent: true });
  const update = {
    [flagPath(IKONIS_FLAGS.ikonis)]: _del,
    [flagPath(IKONIS_FLAGS.addedBonded)]: _del
  };
  if (weapon.getFlag(MODULE_ID, IKONIS_FLAGS.addedBonded)) update["system.itemFeatures"] = { [BONDED_FEATURE]: _del };
  await weapon.update(update);
  await chat(weapon, F("MBF.Ikonis.UnmadeChat", { weapon: esc(weapon.name), ikonis: esc(ikonisName()) }));
}

/* -------------------------------------------- */
/*  Owner: install and remove                   */
/* -------------------------------------------- */

/** Why an augment cannot go in right now, or null. */
export function installProblem(weapon, item) {
  if (!isIkonis(weapon)) return "MBF.Ikonis.NotIkonis";
  const actor = ownerOf(weapon);
  if (!actor || item?.parent !== actor) return "MBF.Ikonis.NotSameOwner";
  if (!weapon.isOwner) return "MBF.Ikonis.NotYours";
  const key = augmentKeyOf(item);
  if (!key) return "MBF.Ikonis.NoAugment";
  const installed = installedKeys(weapon);
  if (installed.includes(key)) return "MBF.Ikonis.AlreadyInstalled";
  if (installed.length >= slotCount(weapon)) return "MBF.Ikonis.NoSlot";
  return null;
}

export async function installAugment(weapon, item) {
  const problem = installProblem(weapon, item);
  if (problem) throw new Error(F(problem, { ikonis: ikonisName() }));
  const key = augmentKeyOf(item);
  const id = featureId(key);
  const update = { "system.itemFeatures": { [id]: { value: id } } };
  if (AUGMENT_RULES[key]?.rangeStep) {
    const range = weapon.system.attack?.range;
    const next = shiftRange(range, AUGMENT_RULES[key].rangeStep);
    if (range && next !== range) {
      update["system.attack.range"] = next;
      update[flagPath(IKONIS_FLAGS.scopeRange)] = range;
    }
  }
  await weapon.update(update);
  await takeAugmentItem(item);
  await chat(weapon, F("MBF.Ikonis.InstalledChat", {
    actor: esc(ownerOf(weapon).name), augment: esc(augment(key).name), weapon: esc(weapon.name)
  }));
}

export async function removeAugment(weapon, key, { silent = false } = {}) {
  if (!weapon.isOwner) throw new Error(L("MBF.Ikonis.NotYours"));
  if (!installedKeys(weapon).includes(key)) return;
  const update = { "system.itemFeatures": { [featureId(key)]: _del } };
  const before = weapon.getFlag(MODULE_ID, IKONIS_FLAGS.scopeRange);
  if (AUGMENT_RULES[key]?.rangeStep && before) {
    update["system.attack.range"] = before;
    update[flagPath(IKONIS_FLAGS.scopeRange)] = _del;
  }
  await weapon.update(update);
  const actor = ownerOf(weapon);
  if (actor) await addAugmentItem(actor, key);
  if (!silent) {
    await chat(weapon, F("MBF.Ikonis.RemovedChat", {
      actor: esc(actor?.name ?? ""), augment: esc(augment(key).name), weapon: esc(weapon.name)
    }));
  }
}
