import { test } from "node:test";
import assert from "node:assert/strict";
import { toBits, payOne, pay, formatCost, addCosts } from "../scripts/money.mjs";
import {
  cleanShop, cleanStock, priceOf, basketCost, basketProblem, changeStock, stockFormula
} from "../scripts/shop-rules.mjs";

const W = (coins, handfuls, bags) => ({ coins, handfuls, bags });

test("8 Bits = 1 Byte, 8 Bytes = 1 Chunk", () => {
  assert.equal(toBits(W(1, 1, 1)), 1 + 8 + 64);
});

test("paying in the same currency keeps the rest untouched", () => {
  assert.deepEqual(payOne(W(5, 3, 12), "bags", 10), W(5, 3, 2));
  assert.deepEqual(payOne(W(5, 3, 0), "coins", 2), W(3, 3, 0));
});

test("smaller money is used in whole pieces before breaking larger money", () => {
  assert.deepEqual(payOne(W(20, 0, 1), "handfuls", 1), W(12, 0, 1));
  assert.deepEqual(payOne(W(3, 9, 0), "bags", 1), W(3, 1, 0));
});

test("change comes back in smaller pieces", () => {
  // A Gear (1 Bit) paid with a Chunk: 7 Bytes and 7 Bits back.
  assert.deepEqual(payOne(W(0, 0, 1), "coins", 1), W(7, 7, 0));
  // Copper (3 Bytes) with 1 Byte and a Chunk: 1 Byte used, Chunk broken, 6 Bytes back.
  assert.deepEqual(payOne(W(0, 1, 1), "handfuls", 3), W(0, 6, 0));
});

test("not enough money: null, wallet untouched", () => {
  const wallet = W(7, 7, 0);
  assert.equal(payOne(wallet, "bags", 1), null);
  assert.deepEqual(wallet, W(7, 7, 0));
});

test("paying a mixed cost never loses or creates money", () => {
  const wallets = [W(0, 0, 3), W(50, 2, 0), W(1, 20, 1), W(100, 100, 100)];
  const costs = [{ coins: 3, handfuls: 2, bags: 1 }, { coins: 9 }, { handfuls: 15 }, { bags: 2, coins: 1 }];
  for (const w of wallets) {
    for (const c of costs) {
      const after = pay(w, c);
      const price = toBits(c);
      if (toBits(w) < price) assert.equal(after, null);
      else {
        assert.ok(after, `${JSON.stringify(w)} pays ${JSON.stringify(c)}`);
        assert.equal(toBits(after), toBits(w) - price);
        for (const v of Object.values(after)) assert.ok(v >= 0);
      }
    }
  }
});

test("cost text", () => {
  assert.equal(formatCost({ coins: 4, handfuls: 3, bags: 1 }), "1 Chunk · 3 Bytes · 4 Bits");
  assert.equal(formatCost({ coins: 1 }), "1 Bit");
  assert.equal(formatCost({}), "–");
  assert.deepEqual(addCosts({ coins: 1 }, { coins: 2, bags: 1 }), { coins: 3, handfuls: 0, bags: 1 });
});

test("shop prices are the scrap values", () => {
  assert.deepEqual(priceOf("coil"), { currency: "coins", amount: 2 });
  assert.deepEqual(priceOf("copper"), { currency: "handfuls", amount: 3 });
  assert.deepEqual(priceOf("battery"), { currency: "bags", amount: 10 });
  assert.deepEqual(basketCost({ coil: 2, copper: 1, battery: 1, nonsense: 5 }), { coins: 4, handfuls: 3, bags: 10 });
});

test("daily stock dice follow the SRD", () => {
  assert.equal(stockFormula("gear"), "1d10");
  assert.equal(stockFormula("gold"), "1d8");
  assert.equal(stockFormula("battery"), "1d6");
});

test("basket checks and stock changes", () => {
  const stock = cleanStock({ coil: 2, gold: 1 });
  assert.equal(stock.gear, 0);
  assert.equal(basketProblem({}, stock), "empty");
  assert.equal(basketProblem({ coil: 3 }, stock), "stock");
  assert.equal(basketProblem({ coil: 2, gold: 1 }, stock), null);
  assert.deepEqual(changeStock(stock, { coil: 2 }, -1).coil, 0);
  assert.deepEqual(changeStock(stock, { gear: 4 }, +1).gear, 4);
});

test("a saved shop is cleaned", () => {
  const shop = cleanShop({ open: 1, name: "  Rooks Stand ", stock: { coil: "3", gear: -1 } });
  assert.equal(shop.open, true);
  assert.equal(shop.name, "Rooks Stand");
  assert.equal(shop.stock.coil, 3);
  assert.equal(shop.stock.gear, 0);
});
