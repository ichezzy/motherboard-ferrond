/**
 * Scrap Shack: one shop at a time, opened by the GM.
 *
 * The shop lives in a world setting (only the GM writes it). An open shop is the GM's approval:
 * players buy and sell there without asking. Every trade goes through the GM's client
 * (User#query), which checks stock and money again, so two players can never buy the last piece.
 */
import { MODULE_ID, QUERY, SCRAP_ITEMS, KINDS, ICON_PATH, scrapItem, salePrice } from "./data.mjs";
import { CLOSED_SHOP, cleanShop, cleanBasket, basketProblem, basketCost, changeStock, stockFormula } from "./shop-rules.mjs";
import { pay, cleanWallet, formatCost, addCosts } from "./money.mjs";
import { askGM, once, requireGM, esc } from "./gm.mjs";
import { addScrap, scrapInfo } from "./scrap.mjs";

const L = key => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);

export const SHOP_SETTING = "shop";
export const SHOP_HOOK = `${MODULE_ID}.shopChanged`;

export function registerShop() {
  game.settings.register(MODULE_ID, SHOP_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: { ...CLOSED_SHOP, stock: {} },
    onChange: () => Hooks.callAll(SHOP_HOOK, shopState())
  });
  CONFIG.queries[QUERY.shopBuy] = handleBuy;
  CONFIG.queries[QUERY.shopSell] = handleSell;
}

export function shopState() {
  return cleanShop(game.settings.get(MODULE_ID, SHOP_SETTING));
}

async function saveShop(shop) {
  await game.settings.set(MODULE_ID, SHOP_SETTING, cleanShop(shop));
}

/* -------------------------------------------- */
/*  GM: open, restock, close                    */
/* -------------------------------------------- */

/** A fresh daily stock, rolled silently: 1d10 per Shard, 1d8 per Metal, 1d6 per Component. */
export async function rollStock() {
  const keys = SCRAP_ITEMS.map(i => i.key);
  const roll = await new Roll(keys.map(stockFormula).join(" + ")).evaluate();
  return Object.fromEntries(keys.map((key, n) => [key, roll.dice[n].results[0].result]));
}

export async function openShop(name, stock) {
  requireGM();
  const before = shopState();
  await saveShop({ open: true, name: name || L("MBF.Shop.DefaultName"), stock, day: before.day || 1 });
  if (!before.open) await postShopCard("open");
}

export async function updateShop(name, stock) {
  requireGM();
  await saveShop({ ...shopState(), name, stock });
}

export async function newDay(name) {
  requireGM();
  const shop = shopState();
  await saveShop({ ...shop, name: name ?? shop.name, day: shop.day + 1, stock: await rollStock() });
}

export async function closeShop() {
  requireGM();
  const shop = shopState();
  if (!shop.open) return;
  await saveShop({ ...shop, open: false });
  await postShopCard("closed");
}

async function postShopCard(state) {
  const name = shopState().name;
  await ChatMessage.create({
    speaker: { alias: name },
    content: `<p>${esc(F(state === "open" ? "MBF.Shop.OpenedChat" : "MBF.Shop.ClosedChat", { name }))}</p>`,
    flags: { [MODULE_ID]: { shopCard: state } }
  });
}

/** Chat card "The shop is open" gets a button that opens the shop window. */
export function renderShopCard(message, html, openWindow) {
  const state = message.getFlag(MODULE_ID, "shopCard");
  if (state !== "open") return;
  const content = html.querySelector(".message-content");
  if (!content || content.querySelector(".mbf-shop-open")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mbf-shop-open";
  button.innerHTML = `<i class="fa-solid fa-store"></i> ${esc(L("MBF.Shop.Browse"))}`;
  button.addEventListener("click", event => {
    event.preventDefault();
    if (!shopState().open) return ui.notifications.warn("MBF.Shop.Closed", { localize: true });
    openWindow();
  });
  content.append(button);
}

/* -------------------------------------------- */
/*  Players: buy and sell                       */
/* -------------------------------------------- */

/** basket: { coil: 2, copper: 1 } */
export function buy(actor, basket) {
  return askGM(QUERY.shopBuy, { actorUuid: actor.uuid, basket: cleanBasket(basket) });
}

/** items: { <item id>: quantity } */
export function sell(actor, items) {
  return askGM(QUERY.shopSell, { actorUuid: actor.uuid, items });
}

async function traderActor(actorUuid, user) {
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor") throw new Error(L("MBF.Claim.NoActor"));
  if (!user.isGM && !actor.testUserPermission(user, "OWNER")) throw new Error(L("MBF.Shop.NotYours"));
  return actor;
}

function itemList(entries) {
  return entries.map(([name, qty]) => `${qty} × ${esc(name)}`).join(", ");
}

async function handleBuy({ actorUuid, basket }, { user }) {
  requireGM();
  return once("shop", async () => {
    const shop = shopState();
    if (!shop.open) throw new Error(L("MBF.Shop.Closed"));
    const actor = await traderActor(actorUuid, user);
    const b = cleanBasket(basket);
    const problem = basketProblem(b, shop.stock);
    if (problem) throw new Error(L(problem === "stock" ? "MBF.Shop.OutOfStock" : "MBF.Shop.Empty"));

    const cost = basketCost(b);
    const wallet = pay(cleanWallet(actor.system.gold), cost);
    if (!wallet) throw new Error(F("MBF.Shop.NotEnough", { price: formatCost(cost) }));

    await saveShop({ ...shop, stock: changeStock(shop.stock, b, -1) });
    await actor.update({ "system.gold.coins": wallet.coins, "system.gold.handfuls": wallet.handfuls, "system.gold.bags": wallet.bags });
    await addScrap(actor, b);

    const list = itemList(Object.entries(b).map(([key, qty]) => [scrapItem(key).name, qty]));
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p class="mbf-trade"><i class="fa-solid fa-store"></i> ${F("MBF.Shop.BoughtChat", {
        actor: esc(actor.name), items: list, price: esc(formatCost(cost)), shop: esc(shop.name)
      })}</p>`
    });
    return { ok: true, cost };
  });
}

async function handleSell({ actorUuid, items }, { user }) {
  requireGM();
  return once("shop", async () => {
    const shop = shopState();
    if (!shop.open) throw new Error(L("MBF.Shop.Closed"));
    const actor = await traderActor(actorUuid, user);

    const sold = [];
    let earned = { coins: 0, handfuls: 0, bags: 0 };
    const restock = {};
    for (const [id, quantity] of Object.entries(items ?? {})) {
      const qty = Math.trunc(Number(quantity));
      if (!(qty > 0)) continue;
      const item = actor.items.get(id);
      const info = scrapInfo(item);
      if (!info) throw new Error(L("MBF.Sell.NoItem"));
      if (qty > (item.system.quantity ?? 0)) throw new Error(F("MBF.Sell.BadQuantity", { max: item.system.quantity ?? 0 }));
      const { currency, amount } = salePrice(info.kind, info.value, qty);
      earned = addCosts(earned, { [currency]: amount });
      if (info.key) restock[info.key] = (restock[info.key] ?? 0) + qty;
      sold.push({ item, qty });
    }
    if (!sold.length) throw new Error(L("MBF.Shop.Empty"));

    for (const { item, qty } of sold) {
      const rest = item.system.quantity - qty;
      if (rest > 0) await item.update({ "system.quantity": rest });
      else await item.delete();
    }
    const gold = cleanWallet(actor.system.gold);
    await actor.update({
      "system.gold.coins": gold.coins + earned.coins,
      "system.gold.handfuls": gold.handfuls + earned.handfuls,
      "system.gold.bags": gold.bags + earned.bags
    });
    await saveShop({ ...shop, stock: changeStock(shop.stock, restock, +1) });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p class="mbf-trade"><i class="fa-solid fa-store"></i> ${F("MBF.Shop.SoldChat", {
        actor: esc(actor.name), items: itemList(sold.map(s => [s.item.name, s.qty])), price: esc(formatCost(earned)), shop: esc(shop.name)
      })}</p>`
    });
    return { ok: true, earned };
  });
}

/** For the windows: price text and icon of a piece. */
export function pieceView(key) {
  const item = scrapItem(key);
  const kind = KINDS[item.kind];
  return { key, name: item.name, kind: item.kind, img: `${ICON_PATH}/scrap/${key}.webp`, currency: kind.currency, price: item.value };
}
