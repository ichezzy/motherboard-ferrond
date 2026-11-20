import { MODULE_ID } from "./data.mjs";
import { registerCurrencySetting, registerCurrencyGuard, applyCurrency } from "./currency.mjs";
import { registerScrapCategory } from "./scrap.mjs";

Hooks.once("init", () => {
  registerCurrencySetting();
  registerCurrencyGuard();
  registerScrapCategory();
});

Hooks.once("ready", async () => {
  await applyCurrency();
  console.log(`${MODULE_ID} | Ready.`);
});
