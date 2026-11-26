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
import { DEVICE_CATEGORY, ARMOR_PART_CATEGORY, recipe } from "./crafting-rules.mjs";
import { blueprintKeyOf, craftedKeyOf } from "./crafted-items.mjs";
import { craftingState } from "./crafting.mjs";
import { openWorkbench } from "./workbench.mjs";

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

function stageTag(key, cls) {
  const r = recipe(key);
  return r ? [[STAGES[r.stage].label, cls]] : [];
}

const inCategory = category => item => item?.type === "loot" && item.system?.category === category && Boolean(craftedKeyOf(item));

/** Own sections after Sleek's loot section, in this order. */
const SECTIONS = [
  { id: "mbf-scrap", title: "MBF.Scrap.SheetGroup", match: item => Boolean(scrapInfo(item)), tags: scrapTags },
  { id: "mbf-augments", title: "MBF.Augment.SheetGroup", match: item => Boolean(augmentKeyOf(item)), tags: augmentTags },
  { id: "mbf-devices", title: "MBF.Crafting.Group.device", match: inCategory(DEVICE_CATEGORY), tags: item => stageTag(craftedKeyOf(item), "tag-blue") },
  { id: "mbf-armor-parts", title: "MBF.Crafting.Group.armorPart", match: inCategory(ARMOR_PART_CATEGORY), tags: item => stageTag(craftedKeyOf(item), "tag-blue") },
  { id: "mbf-blueprints", title: "MBF.Crafting.Group.blueprint", match: item => Boolean(blueprintKeyOf(item)), tags: item => stageTag(blueprintKeyOf(item), "tag-orange") }
];

/** Hook "renderCharacterSheet" (fires for subclasses like SleekCharacterSheet too). */
export function sortScrapIntoLoot(app, element) {
  const root = element ?? app?.element;
  addWorkbenchBar(app, root);
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

/**
 * The "Crafting" bar at the top of the inventory: opens the workbench and shows the state.
 * Sleek UI: first thing in ".inventory-tab". Daggerheart: after the search bar of the inventory tab.
 */
function addWorkbenchBar(app, root) {
  const actor = app?.document ?? app?.actor;
  if (!root || actor?.type !== "character" || !(actor.isOwner || game.user.isGM)) return;
  if (root.querySelector(".mbf-workbench-bar")) return;
  const sleek = root.querySelector(".inventory-tab");
  const dhTab = root.querySelector("section.tab[data-tab='inventory']");
  if (!sleek && !dhTab) return;

  const state = craftingState(actor);
  const count = Object.keys(state.projects).length;
  const bar = document.createElement("div");
  bar.className = "mbf-workbench-bar";
  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML = `<i class="fa-solid fa-screwdriver-wrench"></i> ${game.i18n.localize("MBF.Crafting.Open")}`;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openWorkbench(actor);
  });
  const info = document.createElement("span");
  info.className = "mbf-workbench-info";
  const parts = [game.i18n.format(count === 1 ? "MBF.Crafting.OneProject" : "MBF.Crafting.Projects", { count })];
  if (state.rollReady) parts.push(game.i18n.localize("MBF.Crafting.RollReadyShort"));
  info.textContent = parts.join(" · ");
  bar.append(button, info);

  if (sleek) sleek.prepend(bar);
  else {
    const search = dhTab.querySelector(".search-section");
    if (search) search.after(bar);
    else dhTab.prepend(bar);
  }
}
