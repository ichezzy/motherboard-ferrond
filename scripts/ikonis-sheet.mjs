/**
 * The Ikonis tab on Daggerheart's weapon sheet.
 *
 * Daggerheart's WeaponSheet gets one more tab and part ("ikonis") before "Effects". Its TABS live on
 * a mixin class, so the weapon sheet gets its own copy before the tab is added – other item sheets
 * stay as they are. Action names start with "mbf" (Foundry reserves "close" and "tab").
 */
import { MODULE_ID } from "./data.mjs";
import { STAGES } from "./recipes.mjs";
import { PRESETS, TRAITS, augment, augmentIcon } from "./ikonis-rules.mjs";
import { augmentKeyOf } from "./augments.mjs";
import {
  isIkonis, ownerOf, slotCount, installedKeys, availableAugments, ikonisName,
  makeIkonis, unmakeIkonis, installAugment, removeAugment
} from "./ikonis.mjs";
import { esc } from "./gm.mjs";

const TAB = "ikonis";
const L = key => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);

export function registerIkonisTab() {
  const Weapon = game.system?.api?.applications?.sheets?.items?.Weapon;
  if (!Weapon) {
    console.warn(`${MODULE_ID} | Daggerheart's weapon sheet was not found – no Ikonis tab.`);
    return;
  }

  // Tabs: an own copy for the weapon sheet, "Ikonis" before "Effects".
  if (!Object.hasOwn(Weapon, "TABS")) Weapon.TABS = foundry.utils.deepClone(Weapon.TABS);
  const tabs = Weapon.TABS.primary.tabs;
  if (!tabs.some(t => t.id === TAB)) {
    const at = tabs.findIndex(t => t.id === "effects");
    // The name comes from one language key ("MBF.Ikonis.Name"), so a new name is one line.
    tabs.splice(at < 0 ? tabs.length : at, 0, { id: TAB, label: ikonisName() });
  }

  // Parts: same order.
  if (!Weapon.PARTS[TAB]) {
    const parts = {};
    for (const [id, part] of Object.entries(Weapon.PARTS)) {
      if (id === "effects") parts[TAB] = { template: `modules/${MODULE_ID}/templates/ikonis-tab.hbs`, scrollable: [""] };
      parts[id] = part;
    }
    parts[TAB] ??= { template: `modules/${MODULE_ID}/templates/ikonis-tab.hbs`, scrollable: [""] };
    Weapon.PARTS = parts;
  }

  Object.assign(Weapon.DEFAULT_OPTIONS.actions, {
    mbfIkonisMake: onMake,
    mbfIkonisUnmake: onUnmake,
    mbfIkonisInstall: onInstall,
    mbfIkonisRemove: onRemove
  });

  const prepare = Weapon.prototype._preparePartContext;
  Weapon.prototype._preparePartContext = async function (partId, context, options) {
    const result = await prepare.call(this, partId, context, options);
    if (partId === TAB) (result ?? context).ikonis = tabContext(this.document);
    return result ?? context;
  };
}

function tabContext(weapon) {
  const owner = ownerOf(weapon);
  const isGM = game.user.isGM;
  const name = ikonisName();
  if (!isIkonis(weapon)) {
    return {
      isIkonis: false,
      isGM,
      name,
      intro: F("MBF.Ikonis.NotIkonisHint", { ikonis: name }),
      makeLabel: F("MBF.Ikonis.Make", { ikonis: name })
    };
  }
  const installed = installedKeys(weapon);
  const max = slotCount(weapon);
  const canEdit = weapon.isOwner && Boolean(owner);
  return {
    isIkonis: true,
    isGM,
    name,
    unmakeLabel: F("MBF.Ikonis.Unmake", { ikonis: name }),
    canEdit,
    owner: owner?.name ?? "",
    used: installed.length,
    max,
    augments: installed.map(key => {
      const recipe = augment(key);
      return { key, name: recipe.name, img: augmentIcon(key), stage: STAGES[recipe.stage].label, effect: recipe.effect };
    }),
    emptySlots: Array.from({ length: Math.max(0, max - installed.length) }, (_, n) => n),
    overfull: installed.length > max,
    canInstall: canEdit && installed.length < max && availableAugments(weapon).length > 0,
    noAugmentsHint: canEdit && installed.length < max && !availableAugments(weapon).length
  };
}

/* -------------------------------------------- */
/*  Actions (this = the weapon sheet)           */
/* -------------------------------------------- */

async function run(fn) {
  try {
    await fn();
  } catch (err) {
    ui.notifications.warn(err.message);
  }
}

async function onMake() {
  const weapon = this.document;
  const presetOptions = [`<option value="">${esc(L("MBF.Ikonis.PresetKeep"))}</option>`]
    .concat(Object.keys(PRESETS).map(k => `<option value="${k}">${esc(L(`MBF.Ikonis.Preset.${k}`))}</option>`));
  const current = weapon.system.attack?.roll?.trait;
  const traitOptions = TRAITS.map(t => `<option value="${t}"${t === current ? " selected" : ""}>${esc(L(CONFIG.DH.ACTOR.traits?.[t]?.label ?? t))}</option>`);
  const content = `
    <p>${esc(F("MBF.Ikonis.MakeHint", { weapon: weapon.name, ikonis: ikonisName() }))}</p>
    <div class="form-group"><label>${esc(L("MBF.Ikonis.PresetLabel"))}</label><select name="preset">${presetOptions.join("")}</select></div>
    <div class="form-group"><label>${esc(L("MBF.Ikonis.TraitLabel"))}</label><select name="trait">${traitOptions.join("")}</select></div>
    <p class="hint">${esc(L("MBF.Ikonis.PresetHint"))}</p>`;
  const choice = await foundry.applications.api.DialogV2.prompt({
    window: { title: F("MBF.Ikonis.MakeTitle", { ikonis: ikonisName() }), icon: "fa-solid fa-link" },
    content,
    ok: {
      label: F("MBF.Ikonis.Make", { ikonis: ikonisName() }),
      icon: "fa-solid fa-link",
      callback: (event, button) => ({ preset: button.form.elements.preset.value, trait: button.form.elements.trait.value })
    },
    rejectClose: false
  });
  if (!choice) return;
  await run(() => makeIkonis(weapon, choice.preset ? choice : { preset: "" }));
}

async function onUnmake() {
  const weapon = this.document;
  const yes = await foundry.applications.api.DialogV2.confirm({
    window: { title: F("MBF.Ikonis.UnmakeTitle", { ikonis: ikonisName() }) },
    content: `<p>${esc(F("MBF.Ikonis.UnmakeHint", { weapon: weapon.name, ikonis: ikonisName() }))}</p>`,
    rejectClose: false
  });
  if (yes) await run(() => unmakeIkonis(weapon));
}

async function onInstall() {
  const weapon = this.document;
  const items = availableAugments(weapon);
  if (!items.length) return ui.notifications.info("MBF.Ikonis.NoAugmentsHint", { localize: true });
  const rows = items.map((item, n) => {
    const recipe = augment(augmentKeyOf(item));
    return `<label class="mbf-augment-choice">
      <input type="radio" name="augment" value="${item.id}"${n === 0 ? " checked" : ""}>
      <img src="${esc(item.img)}" alt="">
      <span><strong>${esc(recipe.name)}</strong> <em>${esc(STAGES[recipe.stage].label)}</em>${recipe.effect}</span>
    </label>`;
  });
  const id = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("MBF.Ikonis.InstallTitle"), icon: "fa-solid fa-plug" },
    classes: ["mbf-augment-picker"],
    content: `<p>${esc(L("MBF.Ikonis.InstallHint"))}</p><div class="mbf-augment-choices">${rows.join("")}</div>`,
    ok: { label: L("MBF.Ikonis.Install"), icon: "fa-solid fa-plug", callback: (event, button) => button.form.elements.augment.value },
    rejectClose: false
  });
  if (!id) return;
  const item = ownerOf(weapon)?.items.get(id);
  await run(() => installAugment(weapon, item));
}

async function onRemove(event, target) {
  const weapon = this.document;
  const key = target.dataset.key;
  const recipe = augment(key);
  if (!recipe) return;
  const yes = await foundry.applications.api.DialogV2.confirm({
    window: { title: L("MBF.Ikonis.RemoveTitle") },
    content: `<p>${esc(F("MBF.Ikonis.RemoveHint", { augment: recipe.name, weapon: weapon.name }))}</p>`,
    rejectClose: false
  });
  if (yes) await run(() => removeAugment(weapon, key));
}
