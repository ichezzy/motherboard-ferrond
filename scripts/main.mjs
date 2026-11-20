import { MODULE_ID } from "./data.mjs";
import { registerCurrencySetting, registerCurrencyGuard, applyCurrency } from "./currency.mjs";

Hooks.once("init", () => {
  registerCurrencySetting();
  registerCurrencyGuard();
});

Hooks.once("ready", async () => {
  await applyCurrency();
  console.log(`${MODULE_ID} | Ready.`);
});
