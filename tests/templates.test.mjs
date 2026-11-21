/**
 * Foundry 14 refuses to render an application part whose template has more than one root
 * element ("Template part … must render a single HTML element"). Version 0.1.0 broke on exactly
 * that, so every template is rendered here with sample data and its root elements are counted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = path.join(ROOT, "templates");

// Stand-ins for Foundry's helpers.
const H = Handlebars.create();
H.registerHelper("localize", key => key);
H.registerHelper("checked", value => (value ? "checked" : ""));
H.registerHelper("selectOptions", (options, o) => new H.SafeString(Object.entries(options)
  .map(([k, v]) => `<option value="${k}"${k === o.hash.selected ? " selected" : ""}>${v}</option>`).join("")));

const SAMPLE = {
  difficulties: { easy: "Easy", standard: "Standard" }, difficulty: "standard",
  remnantOptions: { none: "None", some: "Some" }, remnants: "some", dc: 15, maxDice: 20, dcHint: "hint",
  actors: [{ uuid: "Actor.x", name: "Mara", img: "a.webp", checked: true, dice: { shard: 2, metal: 1, component: 0 } }],
  kinds: [{ short: "Shards", die: 6 }], max: 20,
  columns: [{ label: "Easy", dc: 10 }],
  rows: [{ label: "None", cells: [{ dice: [{ name: "none.easy.shard", value: 1, kind: "shard", title: "Shards" }] }] }]
};

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** Number of top-level elements in an HTML string (checks that every tag is closed). */
export function rootCount(html) {
  const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
  let depth = 0;
  let roots = 0;
  let m;
  while ((m = re.exec(html))) {
    const [tag, name, selfClose] = m;
    if (tag.startsWith("</")) {
      depth -= 1;
      assert.ok(depth >= 0, `stray closing tag </${name}>`);
      continue;
    }
    if (depth === 0) roots += 1;
    if (!VOID.has(name.toLowerCase()) && !selfClose) depth += 1;
  }
  assert.equal(depth, 0, "unclosed tags");
  return roots;
}

test("the root counter catches two roots", () => {
  assert.equal(rootCount("<div><p>a</p><input></div><footer><button>b</button></footer>"), 2);
  assert.equal(rootCount("<div><img src=x><br></div>"), 1);
});

for (const file of fs.readdirSync(TEMPLATES).filter(f => f.endsWith(".hbs"))) {
  test(`template ${file} renders exactly one root element`, () => {
    const html = H.compile(fs.readFileSync(path.join(TEMPLATES, file), "utf8"))(SAMPLE);
    assert.equal(rootCount(html), 1);
  });
}
