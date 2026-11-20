/**
 * "Scrap Reward" (GM): pick fight or search, how hard and how many remnants,
 * check the characters and their dice, then release.
 */
import {
  MODULE_ID, REMNANTS, DIFFICULTIES, DIFFICULTY_DC, KIND_ORDER, MAX_DICE, diceFor, difficultyForDC
} from "./data.mjs";
import { lootTable } from "./settings.mjs";
import { createRelease } from "./release.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = key => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);

/** Player characters: the ones assigned to players first, ticked. */
function candidates() {
  const players = game.users.filter(u => !u.isGM);
  const assigned = new Set(players.map(u => u.character?.id).filter(Boolean));
  let actors = game.actors.filter(a => a.type === "character" && players.some(u => a.testUserPermission(u, "OWNER")));
  if (!actors.length) actors = game.actors.filter(a => a.type === "character");
  return actors
    .map(actor => ({ actor, checked: assigned.size ? assigned.has(actor.id) : true }))
    .sort((a, b) => (b.checked - a.checked) || a.actor.name.localeCompare(b.actor.name));
}

export class ScrapRewardDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "mbf-scrap-reward",
    tag: "form",
    classes: ["mbf-reward"],
    window: { title: "MBF.Reward.Title", icon: "fa-solid fa-gears", resizable: true },
    position: { width: 560, height: "auto" },
    form: { handler: ScrapRewardDialog.#onSubmit, closeOnSubmit: true }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/reward-dialog.hbs`, scrollable: [".mbf-reward-actors-wrap"] }
  };

  async _prepareContext() {
    const difficulty = "standard";
    const remnants = "some";
    const dice = diceFor(lootTable(), remnants, difficulty);
    return {
      difficulty,
      remnants,
      dc: DIFFICULTY_DC.standard,
      maxDice: MAX_DICE,
      difficulties: Object.fromEntries(DIFFICULTIES.map(d => [d, `MBF.Difficulty.${d}`])),
      remnantOptions: Object.fromEntries(REMNANTS.map(r => [r, `MBF.Remnants.${r}`])),
      dcHint: F("MBF.Reward.DCHint", DIFFICULTY_DC),
      actors: candidates().map(({ actor, checked }) => ({ uuid: actor.uuid, name: actor.name, img: actor.img, checked, dice }))
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const form = this.element;
    const update = () => {
      const source = form.querySelector("input[name='source']:checked")?.value ?? "fight";
      for (const el of form.querySelectorAll("[data-mbf-show]")) el.classList.toggle("mbf-hidden", el.dataset.mbfShow !== source);
      const difficulty = source === "search" ? difficultyForDC(form.elements.dc.value) : form.elements.difficulty.value;
      const column = form.querySelector(".mbf-dc-column");
      if (column) column.textContent = L(`MBF.Difficulty.${difficulty}`);
      const dice = diceFor(lootTable(), form.elements.remnants.value, difficulty);
      for (const row of form.querySelectorAll("tr[data-mbf-row]")) {
        for (const kind of KIND_ORDER) {
          const input = row.querySelector(`input[data-kind='${kind}']`);
          if (input) input.value = dice[kind];
        }
      }
    };
    for (const el of form.querySelectorAll("input[name='source'], select[name='difficulty'], select[name='remnants']")) {
      el.addEventListener("change", update);
    }
    form.elements.dc?.addEventListener("input", update);
    update();
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const source = data.source === "search" ? "search" : "fight";
    const difficulty = source === "search" ? difficultyForDC(data.dc) : data.difficulty;
    const remnantsLabel = L(`MBF.Remnants.${data.remnants}`);
    const label = source === "search"
      ? F("MBF.Reward.LabelSearch", { dc: Number(data.dc) || 0, remnants: remnantsLabel })
      : F("MBF.Reward.LabelFight", { difficulty: L(`MBF.Difficulty.${difficulty}`), remnants: remnantsLabel });

    const rows = [];
    for (const row of Object.values(data.actors ?? {})) {
      if (!row.selected) continue;
      const actor = await fromUuid(row.uuid);
      if (!actor) continue;
      const dice = Object.fromEntries(KIND_ORDER.map(k => [k, Math.min(MAX_DICE, Math.max(0, Math.trunc(Number(row[k]) || 0)))]));
      rows.push({ actor, dice });
    }
    if (!rows.length) {
      ui.notifications.warn("MBF.Reward.NobodySelected", { localize: true });
      return;
    }
    await createRelease(label, rows);
  }
}

export function openScrapReward() {
  if (!game.user.isGM) return;
  const existing = foundry.applications.instances.get("mbf-scrap-reward");
  if (existing) return existing.render({ force: true });
  return new ScrapRewardDialog().render({ force: true });
}
