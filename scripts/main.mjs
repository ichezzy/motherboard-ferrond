import { MODULE_ID } from "./data.mjs";
import { registerCurrencySetting, registerCurrencyGuard, applyCurrency } from "./currency.mjs";
import { registerScrapCategory } from "./scrap.mjs";
import { registerLootTableSetting } from "./settings.mjs";
import { registerReleaseQueries, renderReleaseCard } from "./release.mjs";
import { openScrapReward } from "./reward-dialog.mjs";
import { registerSellQueries, addSellOption } from "./sell.mjs";
import { registerLootTableMenu } from "./table-editor.mjs";
import { sortScrapIntoLoot, registerContextMenuHooks } from "./sheets.mjs";
import { registerShop, renderShopCard, SHOP_HOOK } from "./shop.mjs";
import { openShopManager, registerShopManagerRefresh } from "./shop-manager.mjs";
import { openShopWindow, registerShopWindowRefresh } from "./shop-window.mjs";
import { addFerrondControls, refreshControls } from "./controls.mjs";

Hooks.once("init", () => {
  registerCurrencySetting();
  registerCurrencyGuard();
  registerLootTableSetting();
  registerLootTableMenu();
  registerScrapCategory();
  registerReleaseQueries();
  registerSellQueries();
  registerShop();

  // For macros: game.modules.get("motherboard-ferrond").api.openScrapReward() etc.
  game.modules.get(MODULE_ID).api = { openScrapReward, openShopManager, openShopWindow };
});

Hooks.once("ready", async () => {
  // "Sell" in the item menu (⋮ / right click) of scrap – on every character sheet class (Daggerheart, Sleek UI, …).
  registerContextMenuHooks(addSellOption);
  registerShopManagerRefresh();
  registerShopWindowRefresh();
  // Players see the Ferrond group only while a shop is open.
  Hooks.on(SHOP_HOOK, () => refreshControls());
  await applyCurrency();
  console.log(`${MODULE_ID} | Ready.`);
});

// The "Ferrond" group on the left (gear): Scrap Reward and Scrap Shack.
Hooks.on("getSceneControlButtons", addFerrondControls);

Hooks.on("renderChatMessageHTML", (message, html) => {
  renderReleaseCard(message, html);
  renderShopCard(message, html, openShopWindow);
});

// Sheets that draw their own inventory (Daggerheart Sleek UI): scrap into a "Loot" section.
Hooks.on("renderCharacterSheet", sortScrapIntoLoot);
