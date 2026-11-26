/**
 * The workbench: one window per character for crafting.
 * Views: projects (countdowns, the long-rest roll), new project, consumables.
 * Opened from the "Crafting" bar in the inventory (Daggerheart's sheet and Sleek UI).
 */
import { MODULE_ID, SCRAP_ITEMS, scrapIcon } from "./data.mjs";
import { STAGES, PRODUCT_TYPES } from "./recipes.mjs";
import { RECIPES } from "./recipes-data.mjs";
import { recipe, needsBlueprint, partRows, piecesAffordable, startProblem, countdownBoxes, productIcon } from "./crafting-rules.mjs";
import { blueprintKeys, scrapCounts } from "./crafted-items.mjs";
import {
  craftingState, actorTier, startProject, cancelProject, setProjectDC, setRollReady, rollProject, buildConsumables
} from "./crafting.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = key => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);
const SCRAP_NAME = Object.fromEntries(SCRAP_ITEMS.map(i => [i.key, i.name]));
const BUILD_TYPES = ["augment", "device", "armorPart"];

export class Workbench extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["mbf-workbench"],
    window: { title: "MBF.Crafting.Title", icon: "fa-solid fa-screwdriver-wrench", resizable: true },
    position: { width: 640, height: 720 },
    // Not "tab" or "close": Foundry handles those itself.
    actions: {
      mbfView: Workbench.#onView,
      mbfStart: Workbench.#onStart,
      mbfCancel: Workbench.#onCancel,
      mbfRoll: Workbench.#onRoll,
      mbfBuild: Workbench.#onBuild,
      mbfGrantRoll: Workbench.#onGrantRoll
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/workbench.hbs`, scrollable: [".mbf-wb-scroll"] }
  };

  constructor(actor, options = {}) {
    super({ ...options, id: `mbf-workbench-${actor.id}` });
    this.actor = actor;
  }

  #view = "projects";

  get title() {
    return F("MBF.Crafting.WindowTitle", { actor: this.actor.name });
  }

  async _prepareContext() {
    const actor = this.actor;
    const state = craftingState(actor);
    const have = scrapCounts(actor);
    const blueprints = blueprintKeys(actor);
    const tier = actorTier(actor);
    const canEdit = actor.isOwner;
    const isGM = game.user.isGM;

    const projects = Object.entries(state.projects).map(([id, p]) => {
      const r = recipe(p.key);
      return {
        id,
        name: r?.name ?? p.key,
        img: productIcon(p.key),
        type: r ? PRODUCT_TYPES[r.type].label : "",
        stage: r ? STAGES[r.stage].label : "",
        dc: p.dc,
        boxes: countdownBoxes(p),
        left: p.progress,
        start: p.start,
        parts: p.parts.map(x => ({ name: SCRAP_NAME[x.key] ?? x.key, img: scrapIcon(x.key), count: x.count }))
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const row = r => {
      const problem = startProblem(r, { tier, blueprints, have });
      return {
        key: r.key,
        name: r.name,
        img: productIcon(r.key),
        stage: STAGES[r.stage].label,
        tier: r.tier,
        effect: r.effect,
        blueprint: needsBlueprint(r),
        hasBlueprint: blueprints.has(r.key),
        parts: partRows(r, have).map(p => ({ ...p, name: SCRAP_NAME[p.key] ?? p.key, img: scrapIcon(p.key) })),
        problem: problem ? L(problem) : "",
        ok: !problem
      };
    };

    const groups = BUILD_TYPES.map(type => ({
      label: L(`MBF.Crafting.Group.${type}`),
      recipes: RECIPES.filter(r => r.type === type).map(row)
    }));

    const consumables = RECIPES.filter(r => r.type === "consumable").map(r => {
      const affordable = piecesAffordable(r, have);
      return { ...row(r), affordable, max: Math.max(1, affordable), canBuild: canEdit && state.rollReady && affordable > 0 };
    });

    return {
      actorName: actor.name,
      tier,
      isGM,
      canEdit,
      rollReady: state.rollReady,
      view: this.#view,
      isProjects: this.#view === "projects",
      isNew: this.#view === "new",
      isConsumables: this.#view === "consumables",
      projects,
      hasProjects: projects.length > 0,
      groups,
      consumables,
      blueprints: [...blueprints].map(k => recipe(k)?.name).filter(Boolean).sort()
    };
  }

  /** Keep the GM's Difficulty fields live. */
  _onRender(context, options) {
    super._onRender?.(context, options);
    for (const input of this.element.querySelectorAll("input[data-mbf-dc]")) {
      input.addEventListener("change", event => run(() => setProjectDC(this.actor, input.dataset.mbfDc, event.target.value)));
    }
  }

  static #onView(event, target) {
    this.#view = target.dataset.view;
    this.render();
  }

  static async #onStart(event, target) {
    const r = recipe(target.dataset.key);
    if (!r) return;
    const yes = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("MBF.Crafting.StartTitle") },
      content: `<p>${F("MBF.Crafting.StartHint", { item: foundry.utils.escapeHTML(r.name) })}</p>`,
      rejectClose: false
    });
    if (!yes) return;
    const ok = await run(() => startProject(this.actor, r.key));
    if (ok !== false) {
      this.#view = "projects";
      this.render();
    }
  }

  static async #onCancel(event, target) {
    const yes = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("MBF.Crafting.CancelTitle") },
      content: `<p>${L("MBF.Crafting.CancelHint")}</p>`,
      rejectClose: false
    });
    if (yes) await run(() => cancelProject(this.actor, target.dataset.id));
  }

  static async #onRoll(event, target) {
    await run(() => rollProject(this.actor, target.dataset.id));
  }

  static async #onBuild(event, target) {
    const input = this.element.querySelector(`input[data-mbf-max="${target.dataset.key}"]`);
    await run(() => buildConsumables(this.actor, target.dataset.key, Number(input?.value) || 1));
  }

  static async #onGrantRoll(event, target) {
    await run(() => setRollReady(this.actor, target.dataset.ready === "true"));
  }
}

/** Runs an action and shows its error as a warning. Returns false on error. */
async function run(fn) {
  try {
    await fn();
    return true;
  } catch (err) {
    ui.notifications.warn(err.message);
    return false;
  }
}

export function openWorkbench(actor) {
  if (!actor || actor.type !== "character") return;
  const existing = foundry.applications.instances.get(`mbf-workbench-${actor.id}`);
  if (existing) return existing.render({ force: true });
  return new Workbench(actor).render({ force: true });
}

/** Re-render open workbenches when their character, its items or its flags change. */
export function registerWorkbenchRefresh() {
  const refresh = actor => {
    if (!actor) return;
    const app = foundry.applications.instances.get(`mbf-workbench-${actor.id}`);
    if (app?.rendered) app.render();
  };
  Hooks.on("updateActor", actor => refresh(actor));
  for (const hook of ["createItem", "updateItem", "deleteItem"]) {
    Hooks.on(hook, item => refresh(item.parent?.documentName === "Actor" ? item.parent : null));
  }
}
