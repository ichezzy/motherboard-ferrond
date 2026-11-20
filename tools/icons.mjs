/**
 * Turns Chezzy's full-size AI images (art/originals/*.webp) into the module icons:
 * trim the empty border, center on a square transparent canvas, scale, save as WebP.
 *
 *   node tools/icons.mjs
 *
 * Scrap items -> assets/icons/scrap/<key>.webp (512 px)
 * Currency    -> assets/icons/currency/<key>.webp (256 px, shown tiny in the sheet)
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
const SCRAP_KEYS = new Set(SCRAP_ITEMS.map(i => i.key));

async function convert(input, output, size) {
  const trimmed = await sharp(input).ensureAlpha().trim({ threshold: 8 }).toBuffer({ resolveWithObject: true });
  const { width, height } = trimmed.info;
  const side = Math.ceil(Math.max(width, height) * 1.06);
  const left = Math.floor((side - width) / 2);
  const top = Math.floor((side - height) / 2);
  await sharp(trimmed.data)
    .extend({ left, right: side - width - left, top, bottom: side - height - top, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(size, size)
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
  else {
    unknown.push(file);
    continue;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await convert(path.join(SOURCE, file), target, size);
  done.push(key);
}

const missing = [...SCRAP_KEYS, ...CURRENCY].filter(k => !done.includes(k));
console.log(`Converted ${done.length} icons.`);
if (missing.length) console.log(`Missing: ${missing.join(", ")}`);
if (unknown.length) console.log(`Not used (unknown name): ${unknown.join(", ")}`);
