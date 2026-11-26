/**
 * Crafting recipes (pure, no Foundry).
 *
 * The rules live in Chezzy's vault note "Crafting (DH)", section "Rezepte": one table row per
 * recipe. tools/recipes.mjs reads that table with parseRecipeTable() and writes the result to
 * scripts/recipes-data.mjs, so the module never needs the vault at runtime.
 */
import { SCRAP_ITEMS } from "./data.mjs";

/** Stages ("Stufe"): tier needed to build, countdown, difficulty, Scraphead wage factor. */
export const STAGES = {
  consumable: { de: "Verbrauchsgut", label: "Consumable", tier: 1, countdown: null, dc: 10, wage: 1 },
  common: { de: "Kleinkram", label: "Common", tier: 1, countdown: 1, dc: 10, wage: 1 },
  uncommon: { de: "Selten", label: "Uncommon", tier: 1, countdown: 2, dc: 12, wage: 2 },
  rare: { de: "Rar", label: "Rare", tier: 2, countdown: 3, dc: 15, wage: 3 },
  veryRare: { de: "Sehr rar", label: "Very Rare", tier: 3, countdown: 4, dc: 18, wage: 4 },
  legendary: { de: "Legendär", label: "Legendary", tier: 4, countdown: 5, dc: 21, wage: 5 }
};

/** Kinds of products ("Art"). */
export const PRODUCT_TYPES = {
  augment: { de: "Augment", label: "Augment" },
  device: { de: "Gerät", label: "Device" },
  armorPart: { de: "Panzerung", label: "Armor Part" },
  consumable: { de: "Verbrauchsgut", label: "Consumable" }
};

const WORKSHOPS = { scraphead: "Scraphead", patcher: "Patcher" };

/** "Störknall (nachladen)" -> "stoerknall-nachladen" */
export function slug(name) {
  return String(name).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The few Markdown marks the vault uses in rule text: **bold** and *italic*. */
export function markdownToHtml(text) {
  const html = escapeHtml(text.trim())
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
  return `<p>${html}</p>`;
}

const SCRAP_BY_NAME = new Map(SCRAP_ITEMS.map(i => [i.name.toLowerCase(), i.key]));

/** "6 Coil · 4 Cobalt" -> [{ key: "coil", count: 6 }, { key: "cobalt", count: 4 }] */
export function parseParts(text) {
  return text.split("·").map(s => s.trim()).filter(Boolean).map(part => {
    const m = part.match(/^(\d+)\s+(.+)$/);
    if (!m) throw new Error(`cannot read part "${part}"`);
    const key = SCRAP_BY_NAME.get(m[2].trim().toLowerCase());
    if (!key) throw new Error(`unknown material "${m[2].trim()}" (must be one of the 18 scrap pieces)`);
    return { key, count: Number(m[1]) };
  });
}

function findKey(table, text, what) {
  const t = text.trim().toLowerCase();
  const hit = Object.entries(table).find(([, v]) => v.de.toLowerCase() === t);
  if (!hit) throw new Error(`unknown ${what} "${text.trim()}"`);
  return hit[0];
}

/** "Rar (Tier 2)" -> "rare" (the tier in brackets must match the stage). */
export function parseStage(text) {
  const m = text.trim().match(/^(.+?)(?:\s*\(Tier\s*(\d)\))?$/);
  const key = findKey(STAGES, m[1], "stage");
  if (m[2] && Number(m[2]) !== STAGES[key].tier) throw new Error(`stage "${text.trim()}" does not match tier ${STAGES[key].tier}`);
  return key;
}

/** "Finesse (12) · Countdown (2)" or "Finesse (10) · pro lange Rast" */
export function parseRoll(text) {
  const m = text.trim().match(/^(\w+)\s*\((\d+)\)\s*·\s*(?:Countdown\s*\((\d+)\)|pro lange Rast)$/i);
  if (!m) throw new Error(`cannot read roll "${text.trim()}"`);
  return { trait: m[1].toLowerCase(), dc: Number(m[2]), countdown: m[3] ? Number(m[3]) : null };
}

function parseWorkshop(text) {
  const t = text.toLowerCase();
  const hit = Object.keys(WORKSHOPS).find(k => t.includes(k));
  if (!hit) throw new Error(`unknown workshop "${text.trim()}"`);
  return hit;
}

function cells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
}

/**
 * Reads the "## Rezepte" table of the vault note.
 * Throws with the line number when a row cannot be read, so a typo is found at once.
 */
export function parseRecipeTable(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex(l => /^##\s+Rezepte\s*$/.test(l));
  if (start < 0) throw new Error(`section "## Rezepte" not found`);
  const recipes = [];
  let header = null;
  for (let n = start + 1; n < lines.length; n++) {
    const line = lines[n];
    if (/^##\s/.test(line)) break;
    if (!line.trim().startsWith("|")) {
      if (header && recipes.length) break; // end of the table
      continue;
    }
    const row = cells(line);
    if (!header) {
      header = row.map(h => h.toLowerCase());
      continue;
    }
    if (row.every(c => /^:?-+:?$/.test(c))) continue; // separator
    try {
      const get = name => row[header.indexOf(name)] ?? "";
      const name = get("produkt");
      const stage = parseStage(get("stufe"));
      const roll = parseRoll(get("wurf"));
      recipes.push({
        key: slug(name),
        name,
        type: findKey(PRODUCT_TYPES, get("art"), "type"),
        stage,
        tier: STAGES[stage].tier,
        parts: parseParts(get("teile")),
        workshop: parseWorkshop(get("wo/wer")),
        roll,
        effect: markdownToHtml(get("wirkung"))
      });
    } catch (err) {
      throw new Error(`Crafting (DH), line ${n + 1}: ${err.message}`);
    }
  }
  if (!recipes.length) throw new Error(`no recipes found under "## Rezepte"`);
  const seen = new Set();
  for (const r of recipes) {
    if (seen.has(r.key)) throw new Error(`recipe "${r.name}" appears twice`);
    seen.add(r.key);
  }
  return recipes;
}
