/**
 * Builds the compendiums from scripts/data.mjs with the official Foundry CLI:
 *   packs/items   "Ferrond Items"  – the 18 scrap pieces in folders Scrap/Shards|Metals|Components,
 *                                    the augments (from the vault's recipe table) in folder Augments,
 *                                    devices, armor parts, consumables and blueprints in their folders
 *   packs/tables  "Ferrond Tables" – Shards (d6), Metals (d8), Components (d10), linked to the items
 *
 *   node tools/build-packs.mjs            -> into the repo (packs/ is not in git)
 *   buildPacks(target)                    -> into another module folder (release)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import {
  MODULE_ID, ITEM_PACK, TABLE_PACK, SCRAP_CATEGORY, SCRAP_ITEMS, KINDS, KIND_ORDER,
  itemId, tableId, scrapIcon, rollRanges
} from "../scripts/data.mjs";
import { STAGES } from "../scripts/recipes.mjs";
import { AUGMENTS, AUGMENT_CATEGORY, augmentIcon, augmentItemId } from "../scripts/ikonis-rules.mjs";
import { RECIPES } from "../scripts/recipes-data.mjs";
import {
  DEVICE_CATEGORY, ARMOR_PART_CATEGORY, BLUEPRINT_CATEGORY, BLUEPRINT_RECIPES, BLUEPRINT_ICON,
  productItemId, blueprintItemId, productIcon
} from "../scripts/crafting-rules.mjs";
import { productFooter, blueprintDescription } from "../scripts/crafted-items.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATS = Object.freeze({ coreVersion: "14.365", systemId: "daggerheart", systemVersion: "2.12.9" });
const ATTRIBUTION = { source: "Motherboard: Ferrond", page: null, artist: "" };

const pad = s => `${s}0000000000000000`.slice(0, 16);
const FOLDER_SCRAP = pad("mbfFolderScrap");
const FOLDER_AUGMENTS = pad("mbfFolderAugment");
const FOLDERS_CRAFTED = {
  device: [pad("mbfFolderDevices"), "Devices", 300000],
  armorPart: [pad("mbfFolderArmorPt"), "Armor Parts", 400000],
  consumable: [pad("mbfFolderConsuma"), "Consumables", 500000]
};
const FOLDER_BLUEPRINTS = pad("mbfFolderBluepri");
const kindFolder = kind => pad(`mbfFolder${kind}`);
const resultId = (kind, n) => pad(`mbfRes${kind}`).slice(0, 14) + String(n).padStart(2, "0");

function folder(id, name, parent, sort) {
  return {
    _id: id, name, type: "Item", folder: parent, sorting: "m", color: null, description: "",
    sort, flags: {}, _stats: { ...STATS }, _key: `!folders!${id}`
  };
}

export function itemDocuments() {
  const docs = [folder(FOLDER_SCRAP, "Scrap", null, 100000)];
  KIND_ORDER.forEach((kind, n) => docs.push(folder(kindFolder(kind), KINDS[kind].plural, FOLDER_SCRAP, (n + 1) * 100000)));
  for (const item of SCRAP_ITEMS) {
    const id = itemId(item.key);
    docs.push({
      _id: id,
      name: item.name,
      type: "loot",
      img: scrapIcon(item.key),
      system: {
        description: `<p>${item.text}</p>`,
        quantity: 1,
        category: SCRAP_CATEGORY,
        categoryData: { kind: item.kind, value: item.value },
        attribution: { ...ATTRIBUTION },
        gmNotes: "",
        actions: {}
      },
      effects: [],
      folder: kindFolder(item.kind),
      sort: item.value * 1000,
      ownership: { default: 0 },
      flags: { [MODULE_ID]: { key: item.key } },
      _stats: { ...STATS },
      _key: `!items!${id}`
    });
  }
  docs.push(folder(FOLDER_AUGMENTS, "Augments", null, 200000));
  const stageOrder = Object.keys(STAGES);
  for (const recipe of AUGMENTS) {
    const id = augmentItemId(recipe.key);
    const SCRAP_NAME = Object.fromEntries(SCRAP_ITEMS.map(i => [i.key, i.name]));
    const parts = recipe.parts.map(p => `${p.count} ${SCRAP_NAME[p.key]}`).join(" · ");
    docs.push({
      _id: id,
      name: recipe.name,
      type: "loot",
      img: augmentIcon(recipe.key),
      system: {
        description: `${recipe.effect}<p><em>${STAGES[recipe.stage].label} augment · Parts: ${parts}</em></p>`,
        quantity: 1,
        category: AUGMENT_CATEGORY,
        categoryData: { key: recipe.key },
        attribution: { ...ATTRIBUTION },
        gmNotes: "",
        actions: {}
      },
      effects: [],
      folder: FOLDER_AUGMENTS,
      sort: (stageOrder.indexOf(recipe.stage) + 1) * 100000 + AUGMENTS.indexOf(recipe) * 100,
      ownership: { default: 0 },
      flags: { [MODULE_ID]: { augment: recipe.key } },
      _stats: { ...STATS },
      _key: `!items!${id}`
    });
  }
  // Devices, armor parts and consumables
  for (const [type, [fid, name, sort]] of Object.entries(FOLDERS_CRAFTED)) docs.push(folder(fid, name, null, sort));
  RECIPES.filter(r => FOLDERS_CRAFTED[r.type]).forEach((r, n) => {
    const id = productItemId(r.key);
    const system = r.type === "consumable"
      ? { description: `${r.effect}${productFooter(r)}`, quantity: 1, consumeOnUse: true }
      : {
        description: `${r.effect}${productFooter(r)}`,
        quantity: 1,
        category: r.type === "device" ? DEVICE_CATEGORY : ARMOR_PART_CATEGORY,
        categoryData: { key: r.key }
      };
    docs.push({
      _id: id,
      name: r.name,
      type: r.type === "consumable" ? "consumable" : "loot",
      img: productIcon(r.key),
      system: { ...system, attribution: { ...ATTRIBUTION }, gmNotes: "", actions: {} },
      effects: [],
      folder: FOLDERS_CRAFTED[r.type][0],
      sort: (n + 1) * 1000,
      ownership: { default: 0 },
      flags: { [MODULE_ID]: { crafted: r.key } },
      _stats: { ...STATS },
      _key: `!items!${id}`
    });
  });

  // Blueprints for everything from Rare on
  docs.push(folder(FOLDER_BLUEPRINTS, "Blueprints", null, 600000));
  BLUEPRINT_RECIPES.forEach((r, n) => {
    const id = blueprintItemId(r.key);
    docs.push({
      _id: id,
      name: `Blueprint: ${r.name}`,
      type: "loot",
      img: BLUEPRINT_ICON,
      system: {
        description: blueprintDescription(r),
        quantity: 1,
        category: BLUEPRINT_CATEGORY,
        categoryData: { key: r.key },
        attribution: { ...ATTRIBUTION },
        gmNotes: "",
        actions: {}
      },
      effects: [],
      folder: FOLDER_BLUEPRINTS,
      sort: (n + 1) * 1000,
      ownership: { default: 0 },
      flags: { [MODULE_ID]: { blueprint: r.key } },
      _stats: { ...STATS },
      _key: `!items!${id}`
    });
  });
  return docs;
}

export function tableDocuments() {
  return KIND_ORDER.map(kind => {
    const id = tableId(kind);
    const k = KINDS[kind];
    return {
      _id: id,
      name: `${k.plural} (d${k.die})`,
      img: "icons/svg/d20-grey.svg",
      description: `<p>Scrap table of the Motherboard frame. The number is the lowest roll for the piece and its worth.</p>`,
      results: rollRanges(kind).map(({ item, range }, n) => {
        const rid = resultId(kind, n);
        return {
          _id: rid,
          type: "document",
          name: item.name,
          img: scrapIcon(item.key),
          description: "",
          documentUuid: `Compendium.${MODULE_ID}.${ITEM_PACK}.Item.${itemId(item.key)}`,
          weight: range[1] - range[0] + 1,
          range,
          drawn: false,
          flags: {},
          _stats: { ...STATS },
          _key: `!tables.results!${id}.${rid}`
        };
      }),
      formula: `1d${k.die}`,
      replacement: true,
      displayRoll: true,
      folder: null,
      sort: (KIND_ORDER.indexOf(kind) + 1) * 100000,
      ownership: { default: 0 },
      flags: {},
      _stats: { ...STATS },
      _key: `!tables!${id}`
    };
  });
}

async function compile(docs, name, target) {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), `${MODULE_ID}-${name}-`));
  try {
    for (const doc of docs) {
      const file = `${doc.name.replace(/[^A-Za-z0-9]+/g, "_")}_${doc._id}.json`;
      fs.writeFileSync(path.join(source, file), JSON.stringify(doc, null, 2) + "\n", "utf8");
    }
    const dest = path.join(target, "packs", name);
    fs.rmSync(dest, { recursive: true, force: true });
    await compilePack(source, dest);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
}

/** Compile both packs into <target>/packs. */
export async function buildPacks(target = ROOT) {
  await compile(itemDocuments(), ITEM_PACK, target);
  await compile(tableDocuments(), TABLE_PACK, target);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildPacks();
  console.log(`Built packs/${ITEM_PACK} (${SCRAP_ITEMS.length} scrap pieces, ${RECIPES.length} products, ${BLUEPRINT_RECIPES.length} blueprints) and packs/${TABLE_PACK} (${KIND_ORDER.length} tables).`);
}
