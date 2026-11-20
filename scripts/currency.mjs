/**
 * Bits · Bytes · Chunks instead of Gold (or dh-ikonis' Quantum).
 *
 * Daggerheart has four currency slots in its Homebrew setting (coins, handfuls, bags, chests).
 * The module renames the first three and switches the fourth off. Values on the character sheets
 * stay in place: whatever was in "coins" (Quantum) is now Bits.
 *
 * dh-ikonis writes "Quantum" into the same setting on every start while its own setting
 * "Enable Quantum Currency" is on, so the module switches that setting off.
 */
import { MODULE_ID, ferrondCurrency, isFerrondCurrency } from "./data.mjs";

const SETTING = "currency";
const IKONIS = "dh-ikonis";
const IKONIS_SETTING = "enableCurrencyOverride";

const systemId = () => CONFIG.DH?.id ?? "daggerheart";
const homebrewKey = () => CONFIG.DH?.SETTINGS?.gameSettings?.Homebrew ?? "Homebrew";

export function registerCurrencySetting() {
  game.settings.register(MODULE_ID, SETTING, {
    name: "MBF.Settings.Currency.Name",
    hint: "MBF.Settings.Currency.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: value => {
      if (value) applyCurrency();
    }
  });
}

export function currencyEnabled() {
  return game.settings.get(MODULE_ID, SETTING);
}

/** Write Bits · Bytes · Chunks into Daggerheart's Homebrew setting (active GM only). */
export async function applyCurrency() {
  if (!game.user.isActiveGM || !currencyEnabled()) return;
  await silenceIkonis();

  const id = systemId();
  const key = homebrewKey();
  if (!game.settings.settings.has(`${id}.${key}`)) return;
  const homebrew = game.settings.get(id, key);
  const data = typeof homebrew?.toObject === "function" ? homebrew.toObject() : foundry.utils.deepClone(homebrew);
  if (!data || isFerrondCurrency(data.currency)) return;

  data.currency = ferrondCurrency(data.currency);
  await game.settings.set(id, key, data);
  console.log(`${MODULE_ID} | Currency set to Bits, Bytes and Chunks.`);
}

async function silenceIkonis() {
  if (!game.modules.get(IKONIS)?.active) return;
  if (!game.settings.settings.has(`${IKONIS}.${IKONIS_SETTING}`)) return;
  if (!game.settings.get(IKONIS, IKONIS_SETTING)) return;
  await game.settings.set(IKONIS, IKONIS_SETTING, false);
  ui.notifications.info("MBF.Currency.IkonisOff", { localize: true });
}

/**
 * On the very first start dh-ikonis may still write "Quantum" in the same ready phase.
 * If the currency gets changed away from Ferrond's, put it back – at most twice per session,
 * so two modules can never fight in a loop. Switch the module setting off to keep another currency.
 */
export function registerCurrencyGuard() {
  let repairs = 0;
  Hooks.on("updateSetting", setting => {
    if (setting.key !== `${systemId()}.${homebrewKey()}`) return;
    if (!game.user.isActiveGM || !currencyEnabled() || repairs >= 2) return;
    const currency = game.settings.get(systemId(), homebrewKey())?.currency;
    if (isFerrondCurrency(currency)) return;
    repairs += 1;
    setTimeout(() => applyCurrency(), 250);
  });
}
