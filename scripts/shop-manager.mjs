/**
 * GM window "Scrap Shack": name the shop, roll or edit the daily stock, open, restock, close.
 */
import { MODULE_ID, SCRAP_ITEMS, KINDS, KIND_ORDER, formatAmount } from "./data.mjs";
import { MAX_STOCK, cleanStock } from "./shop-rules.mjs";
import { shopState, rollStock, openShop, updateShop, newDay, closeShop, pieceView, SHOP_HOOK } from "./shop.mjs";
import { openShopWindow } from "./shop-window.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = key => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);

export class ShopManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "mbf-shop-manager",
    tag: "form",
    classes: ["mbf-shop-manager"],
    window: { title: "MBF.Shop.ManagerTitle", icon: "fa-solid fa-store", resizable: true },
    position: { width: 620, height: "auto" },
    form: { handler: ShopManager.#onSubmit, closeOnSubmit: false },
    actions: {
      reroll: ShopManager.#onReroll,
      newDay: ShopManager.#onNewDay,
      closeShop: ShopManager.#onCloseShop,
      browse: () => openShopWindow()
    }
  };

  // Foundry 14: every part must render exactly one root element, so the footer is its own part.
  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/shop-manager.hbs`, scrollable: [".mbf-shop-groups"] },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  /** Stock shown while the shop is closed (rolled once, can be edited before opening). */
  #draft = null;

  async _prepareContext() {
    const shop = shopState();
    if (!shop.open && !this.#draft) this.#draft = await rollStock();
    const stock = shop.open ? shop.stock : cleanStock(this.#draft);
    const groups = KIND_ORDER.map(kind => ({
      label: `${KINDS[kind].plural} (${F("MBF.Shop.StockDie", { die: { shard: 10, metal: 8, component: 6 }[kind] })})`,
      pieces: SCRAP_ITEMS.filter(i => i.kind === kind).map(i => {
        const p = pieceView(i.key);
        return { ...p, priceText: formatAmount(p.price, p.currency), stock: stock[i.key] };
      })
    }));
    const buttons = shop.open
      ? [
        { type: "button", action: "browse", icon: "fa-solid fa-basket-shopping", label: "MBF.Shop.Browse" },
        { type: "button", action: "newDay", icon: "fa-solid fa-sun", label: "MBF.Shop.NewDay" },
        { type: "button", action: "closeShop", icon: "fa-solid fa-door-closed", label: "MBF.Shop.Close" },
        { type: "submit", icon: "fa-solid fa-floppy-disk", label: "MBF.Shop.Save" }
      ]
      : [
        { type: "button", action: "reroll", icon: "fa-solid fa-dice", label: "MBF.Shop.Reroll" },
        { type: "submit", icon: "fa-solid fa-door-open", label: "MBF.Shop.Open" }
      ];
    return {
      name: shop.name,
      open: shop.open,
      status: shop.open ? F("MBF.Shop.StatusOpen", { day: shop.day }) : L("MBF.Shop.StatusClosed"),
      max: MAX_STOCK,
      groups,
      buttons
    };
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const name = String(data.name ?? "").trim();
    const stock = cleanStock(data.stock);
    if (shopState().open) {
      await updateShop(name || shopState().name, stock);
      ui.notifications.info("MBF.Shop.Saved", { localize: true });
    } else {
      await openShop(name, stock);
      this.#draft = null;
    }
  }

  static async #onReroll() {
    this.#draft = await rollStock();
    this.render();
  }

  static async #onNewDay() {
    const name = this.element.querySelector("input[name='name']")?.value?.trim();
    await newDay(name || undefined);
  }

  // Not "close": Foundry reserves that action name for closing the window itself.
  static async #onCloseShop() {
    this.#draft = null; // the window re-renders on the shop change and rolls a fresh stock
    await closeShop();
  }
}

export function openShopManager() {
  if (!game.user.isGM) return;
  const existing = foundry.applications.instances.get("mbf-shop-manager");
  if (existing) return existing.render({ force: true });
  return new ShopManager().render({ force: true });
}

/** Keep the GM window up to date when the shop changes. */
export function registerShopManagerRefresh() {
  Hooks.on(SHOP_HOOK, () => {
    const app = foundry.applications.instances.get("mbf-shop-manager");
    if (app?.rendered) app.render();
  });
}
