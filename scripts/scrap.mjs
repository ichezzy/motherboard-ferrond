/**
 * Scrap as a loot sub-category of Daggerheart.
 *
 * Daggerheart reads CONFIG.DH.ITEM.itemCategories: loot items with that category get their own
 * inventory section ("Loot"), and the item sheet shows the category data (kind and value).
 * Without the module they stay ordinary loot items.
 */
import { MODULE_ID, SCRAP_CATEGORY, KINDS, ITEM_PACK, scrapItem, itemId, scrapIcon, formatAmount } from "./data.mjs";

export function registerScrapCategory() {
  const fields = foundry.data.fields;
  const categories = CONFIG.DH?.ITEM?.itemCategories;
  if (!categories) {
    console.warn(`${MODULE_ID} | CONFIG.DH.ITEM.itemCategories is missing – scrap stays plain loot.`);
    return;
  }
  categories[SCRAP_CATEGORY] = {
    label: "MBF.Scrap.Category",
    sheetGroup: "MBF.Scrap.SheetGroup",
    data: new fields.SchemaField({
      kind: new fields.StringField({
        required: true,
        blank: false,
        initial: "shard",
        choices: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, `${v.label} (d${v.die})`])),
        label: "MBF.Scrap.Kind"
      }),
      value: new fields.NumberField({
        required: true,
        integer: true,
        min: 0,
        initial: 1,
        label: "MBF.Scrap.Value",
        hint: "MBF.Scrap.ValueHint"
      })
    }, { label: "MBF.Scrap.Category" })
  };

  // Show kind and worth as tags in the inventory row ("Shard", "2 Bits").
  const Loot = CONFIG.Item.dataModels?.loot;
  if (!Loot) return;
  const original = Loot.prototype._getTags;
  Loot.prototype._getTags = function () {
    const tags = original ? original.call(this) : [];
    const scrap = scrapInfo(this.parent);
    if (scrap) tags.push(KINDS[scrap.kind].label, formatAmount(scrap.value, KINDS[scrap.kind].currency));
    return tags;
  };
}

/** { kind, value, key } of a scrap item, or null. */
export function scrapInfo(item) {
  if (item?.type !== "loot" || item.system?.category !== SCRAP_CATEGORY) return null;
  const kind = item.system.categoryData?.kind;
  if (!KINDS[kind]) return null;
  const value = Math.max(0, Number(item.system.categoryData?.value) || 0);
  return { kind, value, key: item.getFlag?.(MODULE_ID, "key") ?? null };
}

/* -------------------------------------------- */
/*  Putting scrap into an inventory (GM side)   */
/* -------------------------------------------- */

/** Item data for a new scrap piece: from the compendium, or built from data.mjs as a fallback. */
async function sourceFor(key) {
  const pack = game.packs.get(`${MODULE_ID}.${ITEM_PACK}`);
  const doc = await pack?.getDocument(itemId(key));
  // Drops id, folder, sort and ownership and remembers the compendium source.
  if (doc) return game.items.fromCompendium(doc, { clearFolder: true });
  const def = scrapItem(key);
  return {
    name: def.name,
    type: "loot",
    img: scrapIcon(key),
    system: { description: `<p>${def.text}</p>`, quantity: 1, category: SCRAP_CATEGORY, categoryData: { kind: def.kind, value: def.value } },
    flags: { [MODULE_ID]: { key } }
  };
}

/** The actor's existing stack of a scrap piece. */
function existingStack(actor, key) {
  return actor.items.find(i => i.type === "loot" && i.getFlag(MODULE_ID, "key") === key && scrapInfo(i)) ?? null;
}

/**
 * Add scrap to an actor: { coil: 2, gold: 1 }. Same pieces stack (quantity).
 * Must run on a client that may update the actor (the GM).
 */
export async function addScrap(actor, counts) {
  const updates = [];
  const creates = [];
  for (const [key, count] of Object.entries(counts)) {
    if (!count) continue;
    const stack = existingStack(actor, key);
    if (stack) updates.push({ _id: stack.id, "system.quantity": (stack.system.quantity ?? 0) + count });
    else {
      const data = await sourceFor(key);
      data.system.quantity = count;
      creates.push(data);
    }
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  if (creates.length) await actor.createEmbeddedDocuments("Item", creates);
}
