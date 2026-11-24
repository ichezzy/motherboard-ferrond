/**
 * The Scrap Shack as plain data and functions (tested in tests/shop.test.mjs).
 * SRD: a shop has a daily stock of 1d10 of each Shard, 1d8 of each Metal and 1d6 of each Component.
 * A piece costs what it is worth (Coil 2 Bits, Battery 10 Chunks) – buying and selling alike.
 */
import { SCRAP_ITEMS, KINDS, scrapItem } from "./data.mjs";

export const STOCK_DIE = { shard: 10, metal: 8, component: 6 };

export const MAX_STOCK = 99;

const whole = n => Math.max(0, Math.trunc(Number(n) || 0));

/** The shop as the world setting stores it. */
export const CLOSED_SHOP = Object.freeze({ open: false, name: "", day: 0, stock: {} });

/** Stock for every scrap piece, missing ones 0, numbers clamped. */
export function cleanStock(stock) {
  return Object.fromEntries(SCRAP_ITEMS.map(i => [i.key, Math.min(MAX_STOCK, whole(stock?.[i.key]))]));
}

export function cleanShop(shop) {
  return {
    open: Boolean(shop?.open),
    name: String(shop?.name ?? "").trim().slice(0, 80),
    day: whole(shop?.day),
    stock: cleanStock(shop?.stock)
  };
}

/** The dice formula for one item's daily stock. */
export function stockFormula(key) {
  return `1d${STOCK_DIE[scrapItem(key).kind]}`;
}

/** Price of one piece: { currency, amount }. */
export function priceOf(key) {
  const item = scrapItem(key);
  return { currency: KINDS[item.kind].currency, amount: item.value };
}

/** Cost block of a basket { key: quantity }. */
export function basketCost(basket) {
  const cost = { coins: 0, handfuls: 0, bags: 0 };
  for (const [key, qty] of Object.entries(basket ?? {})) {
    if (!scrapItem(key)) continue;
    const { currency, amount } = priceOf(key);
    cost[currency] += amount * whole(qty);
  }
  return cost;
}

/** Only real pieces with a positive whole quantity. */
export function cleanBasket(basket) {
  const out = {};
  for (const [key, qty] of Object.entries(basket ?? {})) {
    const n = whole(qty);
    if (n > 0 && scrapItem(key)) out[key] = n;
  }
  return out;
}

/** Problem with buying this basket from this stock, or null. */
export function basketProblem(basket, stock) {
  const b = cleanBasket(basket);
  if (!Object.keys(b).length) return "empty";
  for (const [key, qty] of Object.entries(b)) {
    if (qty > whole(stock?.[key])) return "stock";
  }
  return null;
}

/** Stock after a purchase (−) or a sale (+). */
export function changeStock(stock, basket, sign) {
  const next = cleanStock(stock);
  for (const [key, qty] of Object.entries(cleanBasket(basket))) {
    next[key] = Math.min(MAX_STOCK, Math.max(0, next[key] + sign * qty));
  }
  return next;
}
