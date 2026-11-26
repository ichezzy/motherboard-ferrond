/**
 * Augments in Foundry.
 *
 * Installed: a Daggerheart weapon feature (featureId(key)) on the Ikonis – the system creates and
 * removes its effects and actions. In the inventory: a loot item of the category "ferrond-augment"
 * with its own "Augments" section, so it never changes anything while it is not installed.
 */
import { MODULE_ID, ITEM_PACK } from "./data.mjs";
import { STAGES } from "./recipes.mjs";
import { AUGMENTS, AUGMENT_CATEGORY, augment, augmentIcon, augmentItemId, featureId, weaponFeatureFor } from "./ikonis-rules.mjs";

const L = key => game.i18n.localize(key);

/** Weapon features and the inventory category (init). */
export function registerAugments() {
  const features = CONFIG.DH?.ITEM?.weaponFeatures;
  if (!features) {
    console.warn(`${MODULE_ID} | CONFIG.DH.ITEM.weaponFeatures is missing – augments do nothing.`);
    return;
  }
  for (const recipe of AUGMENTS) features[featureId(recipe.key)] = weaponFeatureFor(recipe);

  const categories = CONFIG.DH.ITEM.itemCategories;
  if (categories) {
    const fields = foundry.data.fields;
    categories[AUGMENT_CATEGORY] = {
      label: "MBF.Augment.Category",
      sheetGroup: "MBF.Augment.SheetGroup",
      data: new fields.SchemaField({
        key: new fields.StringField({
          required: true,
          blank: false,
          initial: AUGMENTS[0]?.key ?? "force",
          choices: Object.fromEntries(AUGMENTS.map(a => [a.key, a.name])),
          label: "MBF.Augment.Key"
        })
      }, { label: "MBF.Augment.Category" })
    };
  }

  // Stage as a tag in the inventory row ("Uncommon").
  const Loot = CONFIG.Item.dataModels?.loot;
  if (!Loot) return;
  const original = Loot.prototype._getTags;
  Loot.prototype._getTags = function () {
    const tags = original ? original.call(this) : [];
    const key = augmentKeyOf(this.parent);
    const recipe = key && augment(key);
    if (recipe) tags.push(L("MBF.Augment.Tag"), STAGES[recipe.stage].label);
    return tags;
  };
}

/** The augment key of an inventory item, or null. */
export function augmentKeyOf(item) {
  if (item?.type !== "loot" || item.system?.category !== AUGMENT_CATEGORY) return null;
  const key = item.system.categoryData?.key ?? item.getFlag?.(MODULE_ID, "augment");
  return augment(key) ? key : null;
}

/** Item data for a new augment item: from the compendium, or built from the recipe. */
async function sourceFor(key) {
  const pack = game.packs.get(`${MODULE_ID}.${ITEM_PACK}`);
  const doc = await pack?.getDocument(augmentItemId(key));
  if (doc) return game.items.fromCompendium(doc, { clearFolder: true });
  return augmentItemData(key);
}

/** Also used by the pack build (tools/build-packs.mjs has its own copy without Foundry). */
export function augmentItemData(key) {
  const recipe = augment(key);
  return {
    name: recipe.name,
    type: "loot",
    img: augmentIcon(key),
    system: { description: recipe.effect, quantity: 1, category: AUGMENT_CATEGORY, categoryData: { key } },
    flags: { [MODULE_ID]: { augment: key } }
  };
}

/** Put one augment back into an inventory; equal augments stack. */
export async function addAugmentItem(actor, key) {
  const stack = actor.items.find(i => augmentKeyOf(i) === key);
  if (stack) return stack.update({ "system.quantity": (stack.system.quantity ?? 0) + 1 });
  const data = await sourceFor(key);
  data.system.quantity = 1;
  return actor.createEmbeddedDocuments("Item", [data]);
}

/** Take one augment out of an inventory. */
export async function takeAugmentItem(item) {
  const left = (item.system.quantity ?? 1) - 1;
  if (left > 0) return item.update({ "system.quantity": left });
  return item.delete();
}
