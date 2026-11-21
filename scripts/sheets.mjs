/**
 * Character sheets other than Daggerheart's own.
 *
 * Daggerheart's sheet shows scrap in its own "Loot" section through CONFIG.DH.ITEM.itemCategories.
 * "Daggerheart Sleek UI" draws its own inventory instead: all loot in one "Item" section and no tags
 * on loot cards. For that sheet the scrap cards are moved into a "Loot" section after rendering
 * (moved, not copied, so Sleek's own listeners stay on them) and get kind and worth as tags.
 */
import { MODULE_ID, KINDS, formatAmount } from "./data.mjs";
import { scrapInfo } from "./scrap.mjs";

const SECTION_ID = "mbf-scrap";
const TAG_CLASS = { shard: "tag-orange", metal: "tag-blue", component: "tag-green" };

/** Hook "renderCharacterSheet" (fires for subclasses like SleekCharacterSheet too). */
export function sortScrapIntoLoot(app, element) {
  const root = element ?? app?.element;
  const lootSection = root?.querySelector?.(".category-wrapper[data-category-id='loot']");
  if (!lootSection) return; // Daggerheart's own sheet: the item category does the job

  const strays = [...lootSection.querySelectorAll(".category-content > .card-wrapper[data-item-uuid]")]
    .filter(card => scrapInfo(fromUuidSync(card.dataset.itemUuid)));
  if (!strays.length) return;

  let section = root.querySelector(`.category-wrapper[data-category-id='${SECTION_ID}']`);
  if (!section) section = buildSection(app, lootSection);
  const content = section.querySelector(".category-content");
  for (const card of strays) {
    content.querySelector(`.card-wrapper[data-item-uuid='${CSS.escape(card.dataset.itemUuid)}']`)?.remove();
    addTags(card);
    content.append(card);
  }
}

/** A copy of Sleek's loot section frame: header "Loot", no "+" button, empty content. */
function buildSection(app, lootSection) {
  const section = lootSection.cloneNode(false);
  section.dataset.categoryId = SECTION_ID;
  section.classList.toggle("collapsed", Boolean(app?.collapsedCategories?.includes?.(SECTION_ID)));

  const header = lootSection.querySelector(".category-header")?.cloneNode(true) ?? document.createElement("div");
  header.classList.add("category-header");
  header.dataset.action = "toggleCategory";
  header.querySelector(".header-btn")?.remove();
  const title = header.querySelector("h2");
  if (title) title.textContent = game.i18n.localize("MBF.Scrap.SheetGroup");

  const content = document.createElement("div");
  content.className = "category-content";
  section.append(header, content);
  lootSection.after(section);
  return section;
}

function addTags(card) {
  const info = scrapInfo(fromUuidSync(card.dataset.itemUuid));
  const tags = card.querySelector(".card-tags");
  if (!info || !tags || tags.querySelector(".mbf-tag")) return;
  const kind = KINDS[info.kind];
  for (const label of [kind.label, formatAmount(info.value, kind.currency)]) {
    const tag = document.createElement("span");
    tag.className = `tag ${TAG_CLASS[info.kind]} mbf-tag`;
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
