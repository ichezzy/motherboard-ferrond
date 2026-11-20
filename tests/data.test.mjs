import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCRAP_ITEMS, KINDS, itemForRoll, rollRanges, isValidResult, diceSlots, describeDice, countByKey,
  DEFAULT_LOOT_TABLE, normalizeTable, diceFor, difficultyForDC, formatAmount, ferrondCurrency,
  isFerrondCurrency, salePrice, itemId, tableId
} from "../scripts/data.mjs";

test("every roll of every die gives the piece from the Motherboard tables", () => {
  const expected = {
    shard: ["gear", "coil", "wire", "trigger", "lens", "crystal"],
    metal: ["aluminum", "aluminum", "copper", "copper", "cobalt", "silver", "platinum", "gold"],
    component: ["fuse", "fuse", "circuit", "circuit", "circuit", "disc", "disc", "relay", "capacitor", "battery"]
  };
  for (const [kind, keys] of Object.entries(expected)) {
    assert.equal(keys.length, KINDS[kind].die);
    keys.forEach((key, n) => assert.equal(itemForRoll(kind, n + 1).key, key, `${kind} roll ${n + 1}`));
  }
});

test("a piece is worth the number in the table header", () => {
  const value = key => SCRAP_ITEMS.find(i => i.key === key).value;
  assert.equal(value("coil"), 2);
  assert.equal(value("copper"), 3);
  assert.equal(value("circuit"), 3);
  assert.equal(value("battery"), 10);
});

test("roll table ranges cover every die face exactly once", () => {
  for (const kind of Object.keys(KINDS)) {
    const faces = rollRanges(kind).flatMap(({ range: [a, b] }) => Array.from({ length: b - a + 1 }, (_, n) => a + n));
    assert.deepEqual(faces, Array.from({ length: KINDS[kind].die }, (_, n) => n + 1));
  }
});

test("typed results must fit the die", () => {
  assert.ok(isValidResult("shard", 6));
  assert.ok(!isValidResult("shard", 7));
  assert.ok(!isValidResult("metal", 0));
  assert.ok(isValidResult("component", 10));
  assert.ok(!isValidResult("component", 2.5));
  assert.ok(!isValidResult("relic", 1));
});

test("Chezzy's loot table, dice per player", () => {
  assert.deepEqual(DEFAULT_LOOT_TABLE.none.easy, { shard: 1, metal: 0, component: 0 });
  assert.deepEqual(DEFAULT_LOOT_TABLE.none.veryDifficult, { shard: 3, metal: 3, component: 0 });
  assert.deepEqual(DEFAULT_LOOT_TABLE.some.standard, { shard: 2, metal: 2, component: 0 });
  assert.deepEqual(DEFAULT_LOOT_TABLE.some.veryDifficult, { shard: 3, metal: 3, component: 1 });
  assert.deepEqual(DEFAULT_LOOT_TABLE.many.easy, { shard: 3, metal: 0, component: 0 });
  assert.deepEqual(DEFAULT_LOOT_TABLE.many.difficult, { shard: 3, metal: 3, component: 1 });
  assert.deepEqual(DEFAULT_LOOT_TABLE.many.veryDifficult, { shard: 3, metal: 3, component: 2 });
});

test("a broken saved table falls back to the default cell by cell", () => {
  const table = normalizeTable({ many: { easy: { shard: "5", metal: -3 } }, some: null });
  assert.deepEqual(table.many.easy, { shard: 5, metal: 0, component: 0 });
  assert.deepEqual(table.some.standard, DEFAULT_LOOT_TABLE.some.standard);
  assert.deepEqual(diceFor(table, "many", "veryDifficult"), { shard: 3, metal: 3, component: 2 });
});

test("looting without a fight: DC picks the column", () => {
  assert.equal(difficultyForDC(10), "easy");
  assert.equal(difficultyForDC(12), "easy");
  assert.equal(difficultyForDC(13), "standard");
  assert.equal(difficultyForDC(15), "standard");
  assert.equal(difficultyForDC(20), "difficult");
  assert.equal(difficultyForDC(23), "veryDifficult");
  assert.equal(difficultyForDC(25), "veryDifficult");
  assert.equal(difficultyForDC("abc"), "easy");
});

test("dice slots and summaries", () => {
  assert.deepEqual(diceSlots({ shard: 2, metal: 0, component: 1 }).map(s => s.kind), ["shard", "shard", "component"]);
  assert.equal(describeDice({ shard: 3, metal: 2, component: 1 }), "3 Shards · 2 Metals · 1 Component");
  assert.equal(describeDice({ shard: 1, metal: 0, component: 0 }), "1 Shard");
  assert.deepEqual(countByKey([{ key: "coil" }, { key: "coil" }, { key: "gold" }]), { coil: 2, gold: 1 });
});

test("money: names, currency block, sale price", () => {
  assert.equal(formatAmount(1, "coins"), "1 Bit");
  assert.equal(formatAmount(4, "coins"), "4 Bits");
  assert.equal(formatAmount(10, "bags"), "10 Chunks");

  const quantum = {
    title: "Quantum",
    coins: { enabled: true, label: "Quantum", icon: "fa-solid fa-atom", initialAmount: 0 },
    handfuls: { enabled: false, label: "Handfuls", icon: "fa-solid fa-coins", initialAmount: 1 },
    bags: { enabled: false, label: "Bags", icon: "fa-solid fa-sack", initialAmount: 0 },
    chests: { enabled: false, label: "Chests", icon: "fa-solid fa-treasure-chest", initialAmount: 0 }
  };
  assert.ok(!isFerrondCurrency(quantum));
  const ferrond = ferrondCurrency(quantum);
  assert.ok(isFerrondCurrency(ferrond));
  assert.equal(ferrond.coins.label, "Bits");
  assert.equal(ferrond.handfuls.label, "Bytes");
  assert.equal(ferrond.bags.label, "Chunks");
  assert.equal(ferrond.chests.enabled, false);
  assert.equal(ferrond.handfuls.initialAmount, 0, "a slot that was off does not hand out its old starting money");

  assert.deepEqual(salePrice("shard", 2, 3), { currency: "coins", amount: 6 });
  assert.deepEqual(salePrice("component", 10, 1), { currency: "bags", amount: 10 });
});

test("compendium ids are valid and unique", () => {
  const ids = [...SCRAP_ITEMS.map(i => itemId(i.key)), ...Object.keys(KINDS).map(tableId)];
  for (const id of ids) assert.match(id, /^[A-Za-z0-9]{16}$/);
  assert.equal(new Set(ids).size, ids.length);
});
