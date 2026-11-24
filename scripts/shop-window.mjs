/**
 * Shop window for players (and the GM): buy from the open Scrap Shack, sell scrap to it.
 * Quantities survive re-renders (another player buying, money changing) until a trade went through.
 */
import { MODULE_ID, SCRAP_ITEMS, KINDS, KIND_ORDER, CURRENCY, formatAmount, salePrice } from "./data.mjs";
import { basketCost, cleanBasket } from "./shop-rules.mjs";
import { pay, cleanWallet, formatCost, addCosts, DENOMINATIONS } from "./money.mjs";
import { shopState, pieceView, buy, sell, SHOP_HOOK } from "./shop.mjs";
import { scrapInfo } from "./scrap.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = key => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);
const ID = "mbf-shop-window";

/** Characters this user may trade for: own characters (GM: all), own assigned one first. */
function traders() {
  const list = game.actors.filter(a => a.type === "character" && (game.user.isGM || a.isOwner));
  const mine = game.user.character;
  return list.sort((a, b) => (b === mine) - (a === mine) || a.name.localeCompare(b.name));
}

export class ShopWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: ID,
    classes: ["mbf-shop-window"],
    window: { title: "MBF.Shop.Title", icon: "fa-solid fa-store", resizable: true },
    position: { width: 560, height: 640 },
    actions: {
      tab: ShopWindow.#onTab,
      buy: ShopWindow.#onBuy,
      sell: ShopWindow.#onSell
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/shop-window.hbs`, scrollable: [".mbf-shop-list"] }
  };

  #tab = "buy";
  #actorUuid = null;
  #buy = {};
  #sell = {};

  get actor() {
    const list = traders();
    return list.find(a => a.uuid === this.#actorUuid) ?? list[0] ?? null;
  }

  async _prepareContext() {
    const shop = shopState();
    const actor = this.actor;
    this.#actorUuid = actor?.uuid ?? null;
    const wallet = cleanWallet(actor?.system.gold);
    const context = {
      shopName: shop.name || L("MBF.Shop.DefaultName"),
      open: shop.open,
      actor,
      actors: traders().map(a => ({ uuid: a.uuid, name: a.name, selected: a === actor })),
      multipleActors: traders().length > 1,
      wallet: [...DENOMINATIONS].reverse().map(d => ({ icon: CURRENCY[d].icon, label: CURRENCY[d].label, value: wallet[d] })),
      isBuy: this.#tab === "buy",
      isSell: this.#tab === "sell"
    };

    context.buyGroups = KIND_ORDER.map(kind => ({
      label: KINDS[kind].plural,
      pieces: SCRAP_ITEMS.filter(i => i.kind === kind).map(i => {
        const p = pieceView(i.key);
        const stock = shop.stock[i.key] ?? 0;
        this.#buy[i.key] = Math.min(this.#buy[i.key] ?? 0, stock);
        return { ...p, priceText: formatAmount(p.price, p.currency), stock, qty: this.#buy[i.key] || "" };
      })
    }));

    context.sellRows = (actor?.items ?? [])
      .filter(item => scrapInfo(item) && (item.system.quantity ?? 0) > 0)
      .sort((a, b) => KIND_ORDER.indexOf(scrapInfo(a).kind) - KIND_ORDER.indexOf(scrapInfo(b).kind) || a.name.localeCompare(b.name))
      .map(item => {
        const info = scrapInfo(item);
        const have = item.system.quantity;
        this.#sell[item.id] = Math.min(this.#sell[item.id] ?? 0, have);
        return {
          id: item.id, name: item.name, img: item.img, have,
          priceText: formatAmount(info.value, KINDS[info.kind].currency),
          qty: this.#sell[item.id] || ""
        };
      });
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    root.querySelector("select[data-mbf-actor]")?.addEventListener("change", event => {
      this.#actorUuid = event.target.value;
      this.#sell = {};
      this.render();
    });
    for (const input of root.querySelectorAll("input[data-mbf-buy], input[data-mbf-sell]")) {
      input.addEventListener("input", () => {
        const max = Number(input.max) || 0;
        const n = Math.min(max, Math.max(0, Math.trunc(Number(input.value) || 0)));
        if (input.dataset.mbfBuy) this.#buy[input.dataset.mbfBuy] = n;
        else this.#sell[input.dataset.mbfSell] = n;
        this.#updateTotals();
      });
    }
    this.#updateTotals();
  }

  #sellEarnings() {
    let earned = { coins: 0, handfuls: 0, bags: 0 };
    for (const [id, qty] of Object.entries(this.#sell)) {
      const item = this.actor?.items.get(id);
      const info = scrapInfo(item);
      if (!info || !qty) continue;
      const { currency, amount } = salePrice(info.kind, info.value, qty);
      earned = addCosts(earned, { [currency]: amount });
    }
    return earned;
  }

  #updateTotals() {
    const root = this.element;
    const total = root.querySelector("[data-mbf-total]");
    const warning = root.querySelector("[data-mbf-warning]");
    const submit = root.querySelector("[data-mbf-submit]");
    if (!total || !submit) return;
    if (this.#tab === "buy") {
      const basket = cleanBasket(this.#buy);
      const cost = basketCost(basket);
      const empty = !Object.keys(basket).length;
      const enough = pay(cleanWallet(this.actor?.system.gold), cost) !== null;
      total.textContent = F("MBF.Shop.Total", { price: formatCost(cost) });
      if (warning) warning.textContent = !empty && !enough ? L("MBF.Shop.NotEnoughShort") : "";
      submit.disabled = empty || !enough || !shopState().open;
    } else {
      const earned = this.#sellEarnings();
      const empty = !Object.values(this.#sell).some(n => n > 0);
      total.textContent = F("MBF.Shop.YouGet", { price: formatCost(earned) });
      if (warning) warning.textContent = "";
      submit.disabled = empty || !shopState().open;
    }
  }

  static #onTab(event, target) {
    this.#tab = target.dataset.tab === "sell" ? "sell" : "buy";
    this.render();
  }

  static async #onBuy(event, target) {
    const actor = this.actor;
    if (!actor) return;
    target.disabled = true;
    try {
      await buy(actor, this.#buy);
      this.#buy = {};
      ui.notifications.info("MBF.Shop.BuyDone", { localize: true });
    } catch (err) {
      ui.notifications.error(err.message ?? String(err));
    }
    this.render();
  }

  static async #onSell(event, target) {
    const actor = this.actor;
    if (!actor) return;
    const items = Object.fromEntries(Object.entries(this.#sell).filter(([, n]) => n > 0));
    target.disabled = true;
    try {
      await sell(actor, items);
      this.#sell = {};
      ui.notifications.info("MBF.Shop.SellDone", { localize: true });
    } catch (err) {
      ui.notifications.error(err.message ?? String(err));
    }
    this.render();
  }
}

export function openShopWindow() {
  if (!shopState().open) return ui.notifications.warn("MBF.Shop.Closed", { localize: true });
  const existing = foundry.applications.instances.get(ID);
  if (existing) return existing.render({ force: true });
  return new ShopWindow().render({ force: true });
}

/** Re-render on shop changes and on changes to the trading character's money or items. */
export function registerShopWindowRefresh() {
  const refresh = actor => {
    const app = foundry.applications.instances.get(ID);
    if (!app?.rendered) return;
    if (!actor || app.actor === actor) app.render();
  };
  Hooks.on(SHOP_HOOK, shop => {
    const app = foundry.applications.instances.get(ID);
    if (!shop.open && app?.rendered) {
      ui.notifications.info("MBF.Shop.ClosedNow", { localize: true });
      return app.close();
    }
    refresh(null);
  });
  Hooks.on("updateActor", actor => refresh(actor));
  for (const event of ["createItem", "updateItem", "deleteItem"]) {
    Hooks.on(event, item => refresh(item.parent));
  }
}
