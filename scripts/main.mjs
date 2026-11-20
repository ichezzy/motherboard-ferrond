import { MODULE_ID } from "./data.mjs";
import { registerCurrencySetting, registerCurrencyGuard, applyCurrency } from "./currency.mjs";
import { registerScrapCategory } from "./scrap.mjs";
import { registerLootTableSetting } from "./settings.mjs";
import { registerReleaseQueries, renderReleaseCard } from "./release.mjs";
import { openScrapReward } from "./reward-dialog.mjs";

Hooks.once("init", () => {
  registerCurrencySetting();
  registerCurrencyGuard();
  registerLootTableSetting();
  registerScrapCategory();
  registerReleaseQueries();

  // For macros: game.modules.get("motherboard-ferrond").api.openScrapReward()
  game.modules.get(MODULE_ID).api = { openScrapReward };
});

Hooks.once("ready", async () => {
  await applyCurrency();
  console.log(`${MODULE_ID} | Ready.`);
});

// GM button in the token tools on the left: "Scrap Reward".
Hooks.on("getSceneControlButtons", controls => {
  const tokens = controls.tokens;
  if (!tokens?.tools || !game.user.isGM) return;
  tokens.tools.mbfScrapReward = {
    name: "mbfScrapReward",
    title: "MBF.Reward.Title",
    icon: "fa-solid fa-gears",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => openScrapReward()
  };
});

Hooks.on("renderChatMessageHTML", (message, html) => renderReleaseCard(message, html));
