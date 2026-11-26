/**
 * Tech damage: Ferrond has no magic damage, only physical and tech (vault: Crafting (DH)).
 * Daggerheart's Homebrew setting can rename its damage types, so the module writes "Tech" there
 * for the "magical" type – the rules stay the system's, only the name and icon change.
 * A name the GM typed in the Homebrew settings is never overwritten.
 */
import { MODULE_ID } from "./data.mjs";

const SETTING = "techDamage";
const TECH = { label: "Tech", abbreviation: "Tch", icon: "fa-solid fa-microchip" };

const systemId = () => CONFIG.DH?.id ?? "daggerheart";
const homebrewKey = () => CONFIG.DH?.SETTINGS?.gameSettings?.Homebrew ?? "Homebrew";

export function registerTechSetting() {
  game.settings.register(MODULE_ID, SETTING, {
    name: "MBF.Settings.Tech.Name",
    hint: "MBF.Settings.Tech.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: value => applyTech(value)
  });
}

async function editHomebrew(fn) {
  const id = systemId();
  const key = homebrewKey();
  if (!game.settings.settings.has(`${id}.${key}`)) return;
  const homebrew = game.settings.get(id, key);
  const data = typeof homebrew?.toObject === "function" ? homebrew.toObject() : foundry.utils.deepClone(homebrew);
  if (!data?.damageTypes?.magical || !fn(data)) return;
  await game.settings.set(id, key, data);
}

/** on = true: "Tech" if the GM has not named it; on = false: back to Magical if it says Tech. */
export async function applyTech(on = game.settings.get(MODULE_ID, SETTING)) {
  if (!game.user.isActiveGM) return;
  await editHomebrew(data => {
    const magical = data.damageTypes.magical;
    if (on && !magical.label) {
      Object.assign(magical, TECH);
      return true;
    }
    if (!on && magical.label === TECH.label) {
      Object.assign(magical, { label: null, abbreviation: null, icon: null });
      return true;
    }
    return false;
  });
}
