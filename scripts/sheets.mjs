/**
 * Character sheets other than Daggerheart's own.
 *
 * Daggerheart's sheet shows scrap in its own "Loot" section through CONFIG.DH.ITEM.itemCategories.
 * "Daggerheart Sleek UI" draws its own inventory instead: all loot in one "Item" section and no tags
 * on loot cards. For that sheet the scrap and augment cards are moved into sections "Loot" and "Augments" after rendering
 * (moved, not copied, so Sleek's own listeners stay on them) and get kind and worth as tags.
 */
import { MODULE_ID, KINDS, formatAmount } from "./data.mjs";
import { scrapInfo } from "./scrap.mjs";
import { STAGES } from "./recipes.mjs";
import { augment } from "./ikonis-rules.mjs";
import { augmentKeyOf } from "./augments.mjs";

const TAG_CLASS = { shard: "tag-orange", metal: "tag-blue", component: "tag-green" };

function scrapTags(item) {
  const info = scrapInfo(item);
  if (!info) return [];
  const kind = KINDS[info.kind];
  return [[kind.label, TAG_CLASS[info.kind]], [formatAmount(info.value, kind.currency), TAG_CLASS[info.kind]]];
}

function augmentTags(item) {
  const recipe = augment(augmentKeyOf(item));
  return recipe ? [[game.i18n.localize("MBF.Augment.Tag"), "tag-purple"], [STAGES[recipe.stage].label, "tag-purple"]] : [];
}

/** Own sections after Sleek's loot section, in this order. */
const SECTIONS = [
  { id: "mbf-scrap", title: "MBF.Scrap.SheetGroup", match: item => Boolean(scrapInfo(item)), tags: scrapTags },
  { id: "mbf-augments", title: "MBF.Augment.SheetGroup", match: item => Boolean(augmentKeyOf(item)), tags: augmentTags }
];

/** Hook "renderCharacterSheet" (fires for subclasses like SleekCharacterSheet too). */
export function sortScrapIntoLoot(app, element) {
  const root = element ?? app?.element;
  const lootSection = root?.querySelector?.(".category-wrapper[data-category-id='loot']");
  if (!lootSection) return; // Daggerheart's own sheet: the item categories do the job

  let after = lootSection;
  for (const def of SECTIONS) {
    const strays = [...lootSection.querySelectorAll(".category-content > .card-wrapper[data-item-uuid]")]
      .filter(card => def.match(fromUuidSync(card.dataset.itemUuid)));
    let section = root.querySelector(`.category-wrapper[data-category-id='${def.id}']`);
    if (!strays.length) {
      if (section) after = section;
      continue;
    }
    if (!section) section = buildSection(app, lootSection, after, def);
    after = section;
    const content = section.querySelector(".category-content");
    for (const card of strays) {
      content.querySelector(`.card-wrapper[data-item-uuid='${CSS.escape(card.dataset.itemUuid)}']`)?.remove();
      addTags(card, def.tags(fromUuidSync(card.dataset.itemUuid)));
      content.append(card);
    }
  }
}

/** A copy of Sleek's loot section frame: own title, no "+" button, empty content. */
function buildSection(app, lootSection, after, def) {
  const section = lootSection.cloneNode(false);
  section.dataset.categoryId = def.id;
  section.classList.toggle("collapsed", Boolean(app?.collapsedCategories?.includes?.(def.id)));

  const header = lootSection.querySelector(".category-header")?.cloneNode(true) ?? document.createElement("div");
  header.classList.add("category-header");
  header.dataset.action = "toggleCategory";
  header.querySelector(".header-btn")?.remove();
  const title = header.querySelector("h2");
  if (title) title.textContent = game.i18n.localize(def.title);

  const content = document.createElement("div");
  content.className = "category-content";
  section.append(header, content);
  after.after(section);
  return section;
}

function addTags(card, list) {
  const tags = card.querySelector(".card-tags");
  if (!list.length || !tags || tags.querySelector(".mbf-tag")) return;
  for (const [label, cls] of list) {
    const tag = document.createElement("span");
    tag.className = `tag ${cls} mbf-tag`;
    tag.textContent = label;
    tags.append(tag);
  }
}

/**
 * Item menus: Daggerheart builds them with parentClassHooks: false, so the hook is named after
 * the sheet's own class ("getCharacterSheetContextOptions", "getSleekCharacterSheetContextOptions", …).
 * Register the handler for every character sheet class there is.
 */
export function registerContextMenuHooks(handler) {
  const names = new Set(["CharacterSheet"]);
  for (const entry of Object.values(CONFIG.Actor.sheetClasses?.character ?? {})) {
    if (entry?.cls?.name) names.add(entry.cls.name);
  }
  for (const name of names) Hooks.on(`get${name}ContextOptions`, handler);
  console.log(`${MODULE_ID} | "Sell" added to the item menus of: ${[...names].join(", ")}`);
}
