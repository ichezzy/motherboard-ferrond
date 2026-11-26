/**
 * Moving from dh-ikonis to Ferrond's own Ikonis.
 *
 * dh-ikonis stored its augments as weapon features "ikonis-…" (on every weapon it opened at least
 * "ikonis-bonded") and seeded them into Daggerheart's Homebrew setting on every start.
 * While dh-ikonis is active the GM is asked to switch it off; once it is off, the leftovers are
 * removed from all weapons in the world and from the Homebrew setting.
 */
import { MODULE_ID } from "./data.mjs";

const IKONIS = "dh-ikonis";
const PREFIX = "ikonis-";

const systemId = () => CONFIG.DH?.id ?? "daggerheart";
const homebrewKey = () => CONFIG.DH?.SETTINGS?.gameSettings?.Homebrew ?? "Homebrew";

function allWeapons() {
  const weapons = game.items.filter(i => i.type === "weapon");
  for (const actor of game.actors) weapons.push(...actor.items.filter(i => i.type === "weapon"));
  return weapons;
}

export async function cleanUpDhIkonis() {
  if (!game.user.isActiveGM) return;
  if (game.modules.get(IKONIS)?.active) {
    ui.notifications.warn(game.i18n.format("MBF.Ikonis.DisableDhIkonis", { ikonis: game.i18n.localize("MBF.Ikonis.Name") }), { permanent: true });
    return;
  }

  let weapons = 0;
  for (const weapon of allWeapons()) {
    const stale = Object.keys(weapon.system.itemFeatures ?? {}).filter(k => k.startsWith(PREFIX));
    const flags = weapon.flags?.[IKONIS];
    if (!stale.length && !flags) continue;
    const update = {};
    if (stale.length) update["system.itemFeatures"] = Object.fromEntries(stale.map(k => [k, _del]));
    if (flags) update[`flags.${IKONIS}`] = _del;
    try {
      await weapon.update(update);
      weapons += 1;
    } catch (err) {
      console.warn(`${MODULE_ID} | Could not clean dh-ikonis data from ${weapon.uuid}`, err);
    }
  }

  let features = 0;
  const id = systemId();
  const key = homebrewKey();
  if (game.settings.settings.has(`${id}.${key}`)) {
    const homebrew = game.settings.get(id, key);
    const data = typeof homebrew?.toObject === "function" ? homebrew.toObject() : foundry.utils.deepClone(homebrew);
    const list = data?.itemFeatures?.weaponFeatures ?? {};
    for (const k of Object.keys(list)) {
      if (k.startsWith(PREFIX)) {
        delete list[k];
        features += 1;
      }
    }
    if (features) await game.settings.set(id, key, data);
  }

  if (weapons || features) {
    console.log(`${MODULE_ID} | dh-ikonis leftovers removed: ${weapons} weapons, ${features} homebrew features.`);
    ui.notifications.info(game.i18n.format("MBF.Ikonis.CleanedUp", { weapons, features }));
  }
}
