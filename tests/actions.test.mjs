/**
 * Foundry 14's ApplicationV2 handles a few button actions itself and never calls the module's
 * handler for them: "close" closes the window, "tab" switches Foundry tabs. Version 0.2.0 used
 * both ("Close shop" only closed the window, the Sell tab did nothing), so no window may use them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESERVED = new Set(["close", "tab", "toggleControls"]);

function read(dir, ext) {
  return fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith(ext))
    .map(f => ({ file: `${dir}/${f}`, text: fs.readFileSync(path.join(ROOT, dir, f), "utf8") }));
}

/** Every action name a template or script defines or uses. */
function actionNames() {
  const found = [];
  for (const { file, text } of read("templates", ".hbs")) {
    for (const m of text.matchAll(/data-action="([^"]+)"/g)) found.push({ file, name: m[1] });
  }
  for (const { file, text } of read("scripts", ".mjs")) {
    for (const m of text.matchAll(/\baction:\s*"([^"]+)"/g)) found.push({ file, name: m[1] });
    for (const block of text.matchAll(/\bactions:\s*\{([^}]*)\}/g)) {
      for (const m of block[1].matchAll(/(\w+)\s*:/g)) found.push({ file, name: m[1] });
    }
  }
  return found;
}

test("the scan finds the module's actions", () => {
  const names = actionNames().map(a => a.name);
  for (const name of ["reroll", "closeShop", "switchTab", "buy", "sell", "reset"]) assert.ok(names.includes(name), name);
});

test("no window uses an action name Foundry handles itself", () => {
  const bad = actionNames().filter(a => RESERVED.has(a.name)).map(a => `${a.file}: ${a.name}`);
  assert.deepEqual(bad, []);
});
