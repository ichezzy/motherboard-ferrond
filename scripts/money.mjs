/**
 * Ferrond money as plain functions: 8 Bits = 1 Byte, 8 Bytes = 1 Chunk.
 * A wallet is Daggerheart's gold block: { coins: Bits, handfuls: Bytes, bags: Chunks }.
 * No Foundry globals in here (tested in tests/money.test.mjs).
 */
import { CURRENCY } from "./data.mjs";

/** Worth of one unit in Bits. */
export const UNIT = { coins: 1, handfuls: 8, bags: 64 };

/** Smallest to largest. */
export const DENOMINATIONS = ["coins", "handfuls", "bags"];

const whole = n => Math.max(0, Math.trunc(Number(n) || 0));

export function cleanWallet(wallet) {
  return Object.fromEntries(DENOMINATIONS.map(d => [d, whole(wallet?.[d])]));
}

export function toBits(wallet) {
  const w = cleanWallet(wallet);
  return DENOMINATIONS.reduce((sum, d) => sum + w[d] * UNIT[d], 0);
}

/** Add a cost block { coins, handfuls, bags } to another. */
export function addCosts(a, b) {
  return Object.fromEntries(DENOMINATIONS.map(d => [d, whole(a?.[d]) + whole(b?.[d])]));
}

/** Change of `bits` Bits as few pieces as possible, in denominations below `below`. */
function changeIn(bits, below) {
  const change = { coins: 0, handfuls: 0, bags: 0 };
  let rest = bits;
  for (const d of [...DENOMINATIONS].reverse()) {
    if (UNIT[d] >= UNIT[below]) continue;
    change[d] = Math.floor(rest / UNIT[d]);
    rest -= change[d] * UNIT[d];
  }
  return change;
}

/**
 * Pay `amount` of one currency from a wallet. Uses that currency first, then smaller money
 * (whole pieces), then breaks larger money and gives change in smaller pieces.
 * Returns the new wallet, or null if the money is not enough.
 */
export function payOne(wallet, currency, amount) {
  if (!UNIT[currency]) throw new Error(`Unknown currency ${currency}`);
  const w = cleanWallet(wallet);
  let rest = whole(amount) * UNIT[currency];
  if (toBits(w) < rest) return null;

  // 1. The same currency, 2. smaller money in whole pieces (Bytes before Bits).
  const idx = DENOMINATIONS.indexOf(currency);
  for (const d of [currency, ...DENOMINATIONS.slice(0, idx).reverse()]) {
    const use = Math.min(w[d], Math.floor(rest / UNIT[d]));
    w[d] -= use;
    rest -= use * UNIT[d];
  }

  // 3. Break larger money (smallest first) and take change.
  for (const d of DENOMINATIONS) {
    if (rest <= 0) break;
    if (!w[d]) continue;
    const use = Math.min(w[d], Math.ceil(rest / UNIT[d]));
    w[d] -= use;
    const paid = use * UNIT[d];
    if (paid > rest) {
      const change = changeIn(paid - rest, d);
      for (const c of DENOMINATIONS) w[c] += change[c];
      rest = 0;
    } else rest -= paid;
  }
  return rest > 0 ? null : w;
}

/** Pay a whole cost block: Chunks first, then Bytes, then Bits. Null if not enough. */
export function pay(wallet, cost) {
  let w = cleanWallet(wallet);
  for (const d of [...DENOMINATIONS].reverse()) {
    const amount = whole(cost?.[d]);
    if (!amount) continue;
    w = payOne(w, d, amount);
    if (!w) return null;
  }
  return w;
}

/** "4 Bits · 3 Bytes · 1 Chunk" (empty parts left out, "–" when nothing). */
export function formatCost(cost) {
  const parts = [...DENOMINATIONS].reverse()
    .filter(d => whole(cost?.[d]) > 0)
    .map(d => `${whole(cost[d])} ${whole(cost[d]) === 1 ? CURRENCY[d].singular : CURRENCY[d].label}`);
  return parts.length ? parts.join(" · ") : "–";
}
