/**
 * Ferrond rules as plain data and pure functions.
 * No Foundry globals in here, so the build tools and the tests can import this file.
 */

export const MODULE_ID = "motherboard-ferrond";

/** Loot sub-category (system.category) of every scrap item. */
export const SCRAP_CATEGORY = "ferrond-scrap";

export const ITEM_PACK = "items";
export const TABLE_PACK = "tables";

/** Query names (Foundry User#query, answered by the active GM). */
export const QUERY = {
  claim: `${MODULE_ID}.claimScrap`,
  sell: `${MODULE_ID}.sellScrap`,
  shopBuy: `${MODULE_ID}.shopBuy`,
  shopSell: `${MODULE_ID}.shopSell`
};

/* -------------------------------------------- */
/*  Currency                                    */
/* -------------------------------------------- */

/**
 * Daggerheart's currency slots, renamed for Ferrond (8 Bits = 1 Byte, 8 Bytes = 1 Chunk).
 * The "chests" slot is switched off.
 */
export const CURRENCY = {
  coins: { label: "Bits", singular: "Bit", icon: "mbf-currency mbf-currency-bits" },
  handfuls: { label: "Bytes", singular: "Byte", icon: "mbf-currency mbf-currency-bytes" },
  bags: { label: "Chunks", singular: "Chunk", icon: "mbf-currency mbf-currency-chunks" }
};

export const CURRENCY_TITLE = "Bits · Bytes · Chunks";

/** The homebrew `currency` block the module writes into Daggerheart's settings. */
export function ferrondCurrency(previous = {}) {
  const slot = (key, enabled) => ({
    enabled,
    label: CURRENCY[key]?.label ?? previous[key]?.label ?? "Chests",
    icon: CURRENCY[key]?.icon ?? previous[key]?.icon ?? "fa-solid fa-treasure-chest",
    initialAmount: enabled ? (previous[key]?.enabled ? previous[key]?.initialAmount ?? 0 : 0) : 0
  });
  return {
    title: CURRENCY_TITLE,
    coins: slot("coins", true),
    handfuls: slot("handfuls", true),
    bags: slot("bags", true),
    chests: slot("chests", false)
  };
}

/** Does Daggerheart's currency block already look like Ferrond's? */
export function isFerrondCurrency(currency) {
  if (!currency) return false;
  for (const key of Object.keys(CURRENCY)) {
    const slot = currency[key];
    if (!slot?.enabled || slot.label !== CURRENCY[key].label || slot.icon !== CURRENCY[key].icon) return false;
  }
  return currency.chests?.enabled === false;
}

/** "1 Bit", "4 Bits", "10 Chunks". */
export function formatAmount(amount, currencyKey) {
  const c = CURRENCY[currencyKey];
  if (!c) return String(amount);
  return `${amount} ${amount === 1 ? c.singular : c.label}`;
}

/* -------------------------------------------- */
/*  Scrap                                       */
/* -------------------------------------------- */

/** The three scrap kinds: die size and the currency their value is paid in. */
export const KINDS = {
  shard: { die: 6, currency: "coins", label: "Shard", plural: "Shards" },
  metal: { die: 8, currency: "handfuls", label: "Metal", plural: "Metals" },
  component: { die: 10, currency: "bags", label: "Component", plural: "Components" }
};

export const KIND_ORDER = ["shard", "metal", "component"];

/**
 * The scrap tables from the Motherboard frame. `value` is the number in the table header:
 * it is the lowest roll that gives the piece AND its worth (Coil = 2 Bits, Battery = 10 Chunks).
 */
export const SCRAP_ITEMS = [
  { key: "gear", kind: "shard", value: 1, name: "Gear", text: "A salvaged cog with chipped teeth. Every machine needs a few." },
  { key: "coil", kind: "shard", value: 2, name: "Coil", text: "Copper wire wound tight around an iron core, pulled from a dead motor." },
  { key: "wire", kind: "shard", value: 3, name: "Wire", text: "A bundle of cable with frayed ends. There is never enough of it." },
  { key: "trigger", kind: "shard", value: 4, name: "Trigger", text: "The trigger assembly of a broken gun, spring still intact." },
  { key: "lens", kind: "shard", value: 5, name: "Lens", text: "A ground glass lens in a dented ring mount, cracked at the edge." },
  { key: "crystal", kind: "shard", value: 6, name: "Crystal", text: "A faceted energy crystal with a faint glow at its core." },
  { key: "aluminum", kind: "metal", value: 1, name: "Aluminum", text: "A crumpled sheet of light metal. Cheap, but every scrap shack takes it." },
  { key: "copper", kind: "metal", value: 3, name: "Copper", text: "A rough ingot of reclaimed copper, spotted with patina." },
  { key: "cobalt", kind: "metal", value: 5, name: "Cobalt", text: "A blue-grey chunk of alloy, broken off a heavy machine." },
  { key: "silver", kind: "metal", value: 6, name: "Silver", text: "Thin plates stripped from old circuitry." },
  { key: "platinum", kind: "metal", value: 7, name: "Platinum", text: "A heavy machined bar. Someone will ask where you got it." },
  { key: "gold", kind: "metal", value: 8, name: "Gold", text: "Melted-down contacts, fused into a lump." },
  { key: "fuse", kind: "component", value: 1, name: "Fuse", text: "An old glass fuse. Sometimes it still works." },
  { key: "circuit", kind: "component", value: 3, name: "Circuit", text: "A broken circuit board with its chips still soldered on." },
  { key: "disc", kind: "component", value: 6, name: "Disc", text: "A data platter from a dead drive. What is on it is anyone's guess." },
  { key: "relay", kind: "component", value: 8, name: "Relay", text: "An electromechanical relay that still clicks." },
  { key: "capacitor", kind: "component", value: 9, name: "Capacitor", text: "A big capacitor. It might still hold a charge, so careful." },
  { key: "battery", kind: "component", value: 10, name: "Battery", text: "A heavy industrial cell, its charge light still glowing." }
];

export const ICON_PATH = `modules/${MODULE_ID}/assets/icons`;

export function scrapIcon(key) {
  return `${ICON_PATH}/scrap/${key}.webp`;
}

/** Stable 16-character document id of a scrap item in the compendium. */
export function itemId(key) {
  return `mbfScrap${key}00000000`.slice(0, 16);
}

/** Stable document id of a roll table in the compendium. */
export function tableId(kind) {
  return `mbfTable${kind}00000000`.slice(0, 16);
}

export function scrapItem(key) {
  return SCRAP_ITEMS.find(i => i.key === key) ?? null;
}

/** The piece a die result gives: the highest table entry not above the roll. */
export function itemForRoll(kind, roll) {
  const candidates = SCRAP_ITEMS.filter(i => i.kind === kind && i.value <= roll);
  return candidates.length ? candidates[candidates.length - 1] : null;
}

/** The roll range [from, to] of every piece of a kind (for the roll tables). */
export function rollRanges(kind) {
  const items = SCRAP_ITEMS.filter(i => i.kind === kind);
  return items.map((item, n) => ({ item, range: [item.value, n + 1 < items.length ? items[n + 1].value - 1 : KINDS[kind].die] }));
}

/** A typed or rolled die result: a whole number between 1 and the die size. */
export function isValidResult(kind, value) {
  const die = KINDS[kind]?.die;
  return Boolean(die) && Number.isInteger(value) && value >= 1 && value <= die;
}

/** One slot per die, in table order: [{kind:"shard"}, {kind:"shard"}, {kind:"metal"}, ...]. */
export function diceSlots(dice) {
  return KIND_ORDER.flatMap(kind => Array.from({ length: Math.max(0, dice?.[kind] ?? 0) }, () => ({ kind })));
}

/** "3 Shards · 2 Metals · 1 Component" (empty kinds left out). */
export function describeDice(dice) {
  const parts = KIND_ORDER.filter(k => (dice?.[k] ?? 0) > 0)
    .map(k => `${dice[k]} ${dice[k] === 1 ? KINDS[k].label : KINDS[k].plural}`);
  return parts.join(" · ");
}

/** Count results per item key: { coil: 2, copper: 1 }. */
export function countByKey(results) {
  const counts = {};
  for (const r of results) counts[r.key] = (counts[r.key] ?? 0) + 1;
  return counts;
}

/* -------------------------------------------- */
/*  Loot table                                  */
/* -------------------------------------------- */

/** Rows: how many remnants (machines) were among the enemies, or in the place that is searched. */
export const REMNANTS = ["none", "some", "many"];

/** Columns: how hard the fight was, or the Difficulty when searching without a fight. */
export const DIFFICULTIES = ["easy", "standard", "difficult", "veryDifficult"];

/** The DC each column stands for when looting without a fight. */
export const DIFFICULTY_DC = { easy: 10, standard: 15, difficult: 20, veryDifficult: 25 };

const d = (shard, metal, component) => ({ shard, metal, component });

/** Chezzy's table (20 Nov 2026): dice for EACH player. */
export const DEFAULT_LOOT_TABLE = {
  none: { easy: d(1, 0, 0), standard: d(2, 1, 0), difficult: d(3, 2, 0), veryDifficult: d(3, 3, 0) },
  some: { easy: d(2, 0, 0), standard: d(2, 2, 0), difficult: d(3, 3, 0), veryDifficult: d(3, 3, 1) },
  many: { easy: d(3, 0, 0), standard: d(3, 2, 0), difficult: d(3, 3, 1), veryDifficult: d(3, 3, 2) }
};

export const MAX_DICE = 20;

function clampDice(n) {
  const v = Math.trunc(Number(n));
  return Number.isFinite(v) ? Math.min(MAX_DICE, Math.max(0, v)) : 0;
}

/** A complete, clean table: missing or broken cells fall back to the default. */
export function normalizeTable(raw) {
  const table = {};
  for (const row of REMNANTS) {
    table[row] = {};
    for (const col of DIFFICULTIES) {
      const cell = raw?.[row]?.[col];
      const fallback = DEFAULT_LOOT_TABLE[row][col];
      table[row][col] = Object.fromEntries(KIND_ORDER.map(k => [k, clampDice(cell?.[k] ?? fallback[k])]));
    }
  }
  return table;
}

export function diceFor(table, remnants, difficulty) {
  const cell = normalizeTable(table)[remnants]?.[difficulty];
  return cell ? { ...cell } : d(0, 0, 0);
}

/** Looting without a fight: the column for a Difficulty (DC 10 / 15 / 20 / 25). */
export function difficultyForDC(dc) {
  const n = Number(dc);
  if (!Number.isFinite(n) || n <= 12) return "easy";
  if (n <= 17) return "standard";
  if (n <= 22) return "difficult";
  return "veryDifficult";
}

/* -------------------------------------------- */
/*  Selling                                     */
/* -------------------------------------------- */

/** What a sale pays: value × quantity, in the currency of the kind. */
export function salePrice(kind, value, quantity) {
  const currency = KINDS[kind]?.currency ?? null;
  const v = Math.max(0, Math.trunc(Number(value) || 0));
  const q = Math.max(0, Math.trunc(Number(quantity) || 0));
  return { currency, amount: v * q };
}
