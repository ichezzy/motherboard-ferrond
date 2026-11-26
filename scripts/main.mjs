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
import { registerAugments, addAugmentItem } from "./augments.mjs";
import { registerIkonisTab } from "./ikonis-sheet.mjs";
import { makeIkonis, unmakeIkonis, installAugment, removeAugment } from "./ikonis.mjs";
import { cleanUpDhIkonis } from "./ikonis-migrate.mjs";
import { registerTechSetting, applyTech } from "./tech.mjs";

Hooks.once("init", () => {
  registerCurrencySetting();
  registerCurrencyGuard();
  registerLootTableSetting();
  registerLootTableMenu();
  registerScrapCategory();
  registerReleaseQueries();
  registerSellQueries();
  registerShop();
  registerTechSetting();
  // Augments: weapon features (installed) and an inventory category (not installed).
  registerAugments();

  // For macros: game.modules.get("motherboard-ferrond").api.openScrapReward() etc.
  game.modules.get(MODULE_ID).api = {
    openScrapReward, openShopManager, openShopWindow,
    makeIkonis, unmakeIkonis, installAugment, removeAugment, addAugmentItem
  };
});

// The Ikonis tab on Daggerheart's weapon sheet (needs the system's API and the translations).
Hooks.once("setup", registerIkonisTab);

Hooks.once("ready", async () => {
  // "Sell" in the item menu (⋮ / right click) of scrap – on every character sheet class (Daggerheart, Sleek UI, …).
  registerContextMenuHooks(addSellOption);
  registerShopManagerRefresh();
  registerShopWindowRefresh();
  // Players see the Ferrond group only while a shop is open.
  Hooks.on(SHOP_HOOK, () => refreshControls());
  await applyCurrency();
  await applyTech();
  // Ferrond's own Ikonis replaces dh-ikonis: ask to switch it off, then remove its leftovers.
  await cleanUpDhIkonis();
  console.log(`${MODULE_ID} | Ready.`);
});

// The "Ferrond" group on the left (gear): Scrap Reward and Scrap Shack.
Hooks.on("getSceneControlButtons", addFerrondControls);

Hooks.on("renderChatMessageHTML", (message, html) => {
  renderReleaseCard(message, html);
  renderShopCard(message, html, openShopWindow);
});

// Sheets that draw their own inventory (Daggerheart Sleek UI): scrap and augments into own sections.
Hooks.on("renderCharacterSheet", sortScrapIntoLoot);
