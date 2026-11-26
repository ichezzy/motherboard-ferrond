/**
 * Turns Chezzy's full-size AI images (art/originals/*.webp) into the module icons:
 * trim the empty border, center on a square transparent canvas, scale, save as WebP.
 *
 *   node tools/icons.mjs
 *
 * Scrap items -> assets/icons/scrap/<key>.webp (512 px)
 * Currency    -> assets/icons/currency/<key>.webp (256 px, shown tiny in the sheet)
 * Toolbar     -> assets/icons/tools/<key>.webp (128 px, white silhouettes used as a CSS mask)
 * Augments    -> assets/icons/augments/<key>.webp (512 px)
 * Crafting    -> assets/icons/crafting/<key>.webp (512 px)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { SCRAP_ITEMS } from "../scripts/data.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "art", "originals");

/** File names in art/originals that differ from the item key. */
const ALIASES = { aluminium: "aluminum" };
const CURRENCY = ["bits", "bytes", "chunks"];
const TOOLS = ["screw", "wrench"];
// Same names as in docs/icon-prompts.md.
const AUGMENTS = ["bonded", "force", "guard", "converge", "amplify", "scope", "deny", "target", "split", "fix", "scare",
  "sear", "absorb", "kick", "block", "zip", "bury", "follow", "override", "magnetzug", "zapfer"];
const CRAFTING = ["leuchtpatrone", "stoerknall", "sinkschirm", "seilwinde", "wegspeicher", "haftsohlen", "prallblech",
  "feldanker", "hitzefutter", "fernlinse", "stolperdraht", "blendscheibe", "lockpieper", "flickblech", "rohrladung",
  "ladepatrone", "spuersender", "blauglas", "datenstecker", "speicherkern", "bauplan"];
const SCRAP_KEYS = new Set(SCRAP_ITEMS.map(i => i.key));

const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

async function convert(input, output, size) {
  const trimmed = await sharp(input).ensureAlpha().trim({ threshold: 8 }).png().toBuffer();
  // Fit the trimmed picture into the inner square (keeps its proportions), then add an even margin.
  // sharp always resizes before it extends, so the margin is in final pixels.
  const inner = Math.round(size / 1.06);
  const margin = size - inner;
  const a = Math.floor(margin / 2);
  await sharp(trimmed)
    .resize(inner, inner, { fit: "contain", background: CLEAR })
    .extend({ left: a, right: margin - a, top: a, bottom: margin - a, background: CLEAR })
    .webp({ quality: 88, alphaQuality: 100 })
    .toFile(output);
}

const done = [];
const unknown = [];
for (const file of fs.readdirSync(SOURCE).filter(f => /\.(webp|png|jpe?g)$/i.test(f))) {
  const base = path.parse(file).name.toLowerCase();
  const key = ALIASES[base] ?? base;
  let target;
  let size;
  if (SCRAP_KEYS.has(key)) [target, size] = [path.join(ROOT, "assets", "icons", "scrap", `${key}.webp`), 512];
  else if (CURRENCY.includes(key)) [target, size] = [path.join(ROOT, "assets", "icons", "currency", `${key}.webp`), 256];
  else if (TOOLS.includes(key)) [target, size] = [path.join(ROOT, "assets", "icons", "tools", `${key}.webp`), 128];
  else if (AUGMENTS.includes(key)) [target, size] = [path.join(ROOT, "assets", "icons", "augments", `${key}.webp`), 512];
  else if (CRAFTING.includes(key)) [target, size] = [path.join(ROOT, "assets", "icons", "crafting", `${key}.webp`), 512];
  else {
    unknown.push(file);
    continue;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await convert(path.join(SOURCE, file), target, size);
  done.push(key);
}

console.log(`Converted ${done.length} icons.`);
for (const [label, keys] of [["Scrap", [...SCRAP_KEYS]], ["Currency", CURRENCY], ["Toolbar", TOOLS], ["Augments", AUGMENTS], ["Crafting", CRAFTING]]) {
  const missing = keys.filter(k => !done.includes(k));
  if (missing.length) console.log(`Missing ${label} (${missing.length}): ${missing.join(", ")}`);
}
if (unknown.length) console.log(`Not used (unknown name): ${unknown.join(", ")}`);
