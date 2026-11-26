/**
 * Crafted things in the inventory: devices, armor parts, consumables, augments and blueprints.
 *
 * Devices, armor parts and blueprints are loot items with their own category (own inventory
 * sections); consumables are Daggerheart consumables; augments are the items of augments.mjs.
 * A blueprint in the inventory is what lets a character build a Rare or better recipe.
 */
import { MODULE_ID, ITEM_PACK, SCRAP_ITEMS } from "./data.mjs";
import { STAGES, PRODUCT_TYPES } from "./recipes.mjs";
import { RECIPES } from "./recipes-data.mjs";
import { scrapInfo } from "./scrap.mjs";
import { AUGMENT_CATEGORY } from "./ikonis-rules.mjs";
import { addAugmentItem } from "./augments.mjs";
import {
  recipe, DEVICE_CATEGORY, ARMOR_PART_CATEGORY, BLUEPRINT_CATEGORY, BLUEPRINT_RECIPES,
  productItemId, blueprintItemId, productIcon, BLUEPRINT_ICON
} from "./crafting-rules.mjs";

const L = key => game.i18n.localize(key);

const SCRAP_NAME = Object.fromEntries(SCRAP_ITEMS.map(i => [i.key, i.name]));
export const partsText = parts => parts.map(p => `${p.count} ${SCRAP_NAME[p.key]}`).join(" · ");

/** Text under a product: "Uncommon device · Parts: 3 Coil · …" (also used by the pack build). */
export function productFooter(r) {
  return `<p><em>${STAGES[r.stage].label} ${PRODUCT_TYPES[r.type].label.toLowerCase()} · Parts: ${partsText(r.parts)}</em></p>`;
}

export function blueprintDescription(r) {
  return `<p>Blueprint for <strong>${r.name}</strong> (${STAGES[r.stage].label} ${PRODUCT_TYPES[r.type].label.toLowerCase()}, Tier ${r.tier}). ` +
    `Whoever has it in their inventory can build it at the workbench.</p><p><em>Parts: ${partsText(r.parts)}</em></p>`;
}

/* -------------------------------------------- */
/*  Categories (init)                           */
/* -------------------------------------------- */

export function registerCraftedCategories() {
  const categories = CONFIG.DH?.ITEM?.itemCategories;
  if (!categories) return;
  const fields = foundry.data.fields;
  const keyField = (list, label) => new fields.SchemaField({
    key: new fields.StringField({
      required: true,
      blank: false,
      initial: list[0]?.key ?? "",
      choices: Object.fromEntries(list.map(r => [r.key, r.name])),
      label
    })
  }, { label });

  categories[DEVICE_CATEGORY] = {
    label: "MBF.Crafting.Category.device",
    sheetGroup: "MBF.Crafting.Group.device",
    data: keyField(RECIPES.filter(r => r.type === "device"), "MBF.Crafting.Category.device")
  };
  categories[ARMOR_PART_CATEGORY] = {
    label: "MBF.Crafting.Category.armorPart",
    sheetGroup: "MBF.Crafting.Group.armorPart",
    data: keyField(RECIPES.filter(r => r.type === "armorPart"), "MBF.Crafting.Category.armorPart")
  };
  categories[BLUEPRINT_CATEGORY] = {
    label: "MBF.Crafting.Category.blueprint",
    sheetGroup: "MBF.Crafting.Group.blueprint",
    data: keyField(BLUEPRINT_RECIPES, "MBF.Crafting.Category.blueprint")
  };

  const Loot = CONFIG.Item.dataModels?.loot;
  if (!Loot) return;
  const original = Loot.prototype._getTags;
  Loot.prototype._getTags = function () {
    const tags = original ? original.call(this) : [];
    const item = this.parent;
    const blueprint = blueprintKeyOf(item);
    if (blueprint) tags.push(L("MBF.Crafting.Category.blueprint"), STAGES[recipe(blueprint).stage].label);
    const key = craftedKeyOf(item);
    if (key && [DEVICE_CATEGORY, ARMOR_PART_CATEGORY].includes(this.category)) tags.push(STAGES[recipe(key).stage].label);
    return tags;
  };
}

/* -------------------------------------------- */
/*  Reading the inventory                       */
/* -------------------------------------------- */

export function blueprintKeyOf(item) {
  if (item?.type !== "loot" || item.system?.category !== BLUEPRINT_CATEGORY) return null;
  const key = item.system.categoryData?.key ?? item.getFlag?.(MODULE_ID, "blueprint");
  return recipe(key) ? key : null;
}

/** Recipe key of a crafted item (device, armor part, consumable; augments have their own flag). */
export function craftedKeyOf(item) {
  const key = item?.getFlag?.(MODULE_ID, "crafted") ?? item?.system?.categoryData?.key;
  if (!key || !recipe(key)) return null;
  if (item.type === "consumable") return item.getFlag(MODULE_ID, "crafted") ? key : null;
  if (item.type !== "loot") return null;
  return [DEVICE_CATEGORY, ARMOR_PART_CATEGORY, AUGMENT_CATEGORY].includes(item.system.category) ? key : null;
}

export const isFlawed = item => Boolean(item?.getFlag?.(MODULE_ID, "flawed"));

/** Keys of all blueprints in the actor's inventory. */
export function blueprintKeys(actor) {
  return new Set(actor.items.map(blueprintKeyOf).filter(Boolean));
}

/** Scrap in the inventory: { coil: 5, … } */
export function scrapCounts(actor) {
  const have = {};
  for (const item of actor.items) {
    const info = scrapInfo(item);
    if (info?.key) have[info.key] = (have[info.key] ?? 0) + (item.system.quantity ?? 0);
  }
  return have;
}

/** Take parts out of the inventory (several stacks of one piece are possible). */
export async function removeScrap(actor, parts) {
  const updates = [];
  const deletes = [];
  for (const { key, count } of parts) {
    let left = count;
    for (const item of actor.items.filter(i => scrapInfo(i)?.key === key)) {
      if (left <= 0) break;
      const qty = item.system.quantity ?? 0;
      if (qty <= left) {
        deletes.push(item.id);
        left -= qty;
      } else {
        updates.push({ _id: item.id, "system.quantity": qty - left });
        left = 0;
      }
    }
    if (left > 0) throw new Error(game.i18n.localize("MBF.Crafting.MissingParts"));
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  if (deletes.length) await actor.deleteEmbeddedDocuments("Item", deletes);
}

/* -------------------------------------------- */
/*  Making products                             */
/* -------------------------------------------- */

const FLAWED_NOTE = () => `<p><strong>${L("MBF.Crafting.Flawed")}:</strong> ${L("MBF.Crafting.FlawedNote")}</p>`;

/** Item data for a product, built from the recipe (also the fallback without compendium). */
export function productData(key) {
  const r = recipe(key);
  const flags = { [MODULE_ID]: { crafted: key } };
  const description = `${r.effect}${productFooter(r)}`;
  if (r.type === "consumable") {
    return { name: r.name, type: "consumable", img: productIcon(key), system: { description, quantity: 1, consumeOnUse: true }, flags };
  }
  if (r.type === "augment") {
    return {
      name: r.name, type: "loot", img: productIcon(key),
      system: { description, quantity: 1, category: AUGMENT_CATEGORY, categoryData: { key } },
      flags: { [MODULE_ID]: { augment: key, crafted: key } }
    };
  }
  const category = r.type === "device" ? DEVICE_CATEGORY : ARMOR_PART_CATEGORY;
  return { name: r.name, type: "loot", img: productIcon(key), system: { description, quantity: 1, category, categoryData: { key } }, flags };
}

export function blueprintData(key) {
  const r = recipe(key);
  return {
    name: `${L("MBF.Crafting.BlueprintPrefix")}: ${r.name}`,
    type: "loot",
    img: BLUEPRINT_ICON,
    system: { description: blueprintDescription(r), quantity: 1, category: BLUEPRINT_CATEGORY, categoryData: { key } },
    flags: { [MODULE_ID]: { blueprint: key } }
  };
}

async function sourceFor(key) {
  const pack = game.packs.get(`${MODULE_ID}.${ITEM_PACK}`);
  const doc = await pack?.getDocument(productItemId(key));
  const data = doc ? game.items.fromCompendium(doc, { clearFolder: true }) : productData(key);
  data.flags ??= {};
  data.flags[MODULE_ID] = { ...(data.flags[MODULE_ID] ?? {}), crafted: key };
  return data;
}

/** Same product, same flaw → same stack. */
function existingStack(actor, key, flawed) {
  return actor.items.find(i => craftedKeyOf(i) === key && isFlawed(i) === flawed) ?? null;
}

/** Put finished products into an inventory. */
export async function addProduct(actor, key, count = 1, { flawed = false } = {}) {
  if (count <= 0) return;
  if (recipe(key)?.type === "augment") {
    for (let n = 0; n < count; n++) await addAugmentItem(actor, key);
    return;
  }
  const stack = existingStack(actor, key, flawed);
  if (stack) return stack.update({ "system.quantity": (stack.system.quantity ?? 0) + count });
  const data = await sourceFor(key);
  data.system.quantity = count;
  if (flawed) {
    data.name = `${data.name} (${L("MBF.Crafting.Flawed")})`;
    data.system.description = `${FLAWED_NOTE()}${data.system.description ?? ""}`;
    data.flags[MODULE_ID].flawed = true;
  }
  return actor.createEmbeddedDocuments("Item", [data]);
}
