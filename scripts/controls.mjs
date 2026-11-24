/**
 * The "Ferrond" group in the scene controls on the left (gear).
 *   GM:      Scrap Reward, Scrap Shack (manage the shop)
 *   Players: Scrap Shack (browse) – only while a shop is open
 * The group has no canvas layer, so the token layer stays active while it is selected.
 */
import { openScrapReward } from "./reward-dialog.mjs";
import { shopState } from "./shop.mjs";
import { openShopManager } from "./shop-manager.mjs";
import { openShopWindow } from "./shop-window.mjs";

const GROUP = "ferrond";

function groupVisible() {
  return game.user.isGM || shopState().open;
}

/** Hook "getSceneControlButtons" (Foundry 14 asks once, and again on render({reset: true})). */
export function addFerrondControls(controls) {
  if (!groupVisible()) return;
  const tools = {};
  if (game.user.isGM) {
    tools.mbfScrapReward = {
      name: "mbfScrapReward",
      title: "MBF.Reward.Title",
      icon: "mbf-tool-icon mbf-tool-screw",
      order: 1,
      button: true,
      onChange: () => openScrapReward()
    };
  }
  tools.mbfScrapShack = {
    name: "mbfScrapShack",
    title: game.user.isGM ? "MBF.Shop.ManagerTitle" : "MBF.Shop.Title",
    icon: "fa-solid fa-store",
    order: 2,
    button: true,
    onChange: () => (game.user.isGM ? openShopManager() : openShopWindow())
  };
  controls[GROUP] = {
    name: GROUP,
    title: "MBF.Controls.Ferrond",
    icon: "fa-solid fa-gear",
    order: Object.keys(controls).length + 1,
    visible: true,
    tools
  };
}

/** Rebuild the controls when the shop opens or closes (players see the group only then). */
export async function refreshControls() {
  if (!ui.controls?.rendered) return;
  // If the group disappears while it is selected, switch to the tokens first – Foundry needs an existing group.
  const leaving = ui.controls.control?.name === GROUP && !groupVisible();
  await ui.controls.render({ reset: true, ...(leaving ? { control: "tokens" } : {}) });
}
