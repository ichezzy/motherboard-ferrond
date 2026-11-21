/**
 * Module settings → "Loot Table": the dice per player for every row (remnants)
 * and column (fight difficulty / search DC). Reset brings back Chezzy's table.
 */
import { MODULE_ID, REMNANTS, DIFFICULTIES, DIFFICULTY_DC, KIND_ORDER, KINDS, MAX_DICE, DEFAULT_LOOT_TABLE } from "./data.mjs";
import { lootTable, saveLootTable } from "./settings.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class LootTableEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "mbf-loot-table",
    tag: "form",
    classes: ["mbf-loot-table"],
    window: { title: "MBF.Table.Title", icon: "fa-solid fa-table", resizable: true },
    position: { width: 760, height: "auto" },
    form: { handler: LootTableEditor.#onSubmit, closeOnSubmit: true },
    actions: { reset: LootTableEditor.#onReset }
  };

  // Foundry 14: every part must render exactly one root element, so the footer is its own part.
  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/loot-table.hbs` },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  async _prepareContext() {
    const table = lootTable();
    return {
      max: MAX_DICE,
      kinds: KIND_ORDER.map(k => ({ short: KINDS[k].plural, die: KINDS[k].die })),
      columns: DIFFICULTIES.map(d => ({ label: `MBF.Difficulty.${d}`, dc: DIFFICULTY_DC[d] })),
      rows: REMNANTS.map(r => ({
        label: `MBF.Remnants.${r}`,
        cells: DIFFICULTIES.map(d => ({
          dice: KIND_ORDER.map(k => ({ name: `${r}.${d}.${k}`, value: table[r][d][k], kind: k, title: `${KINDS[k].plural} (d${KINDS[k].die})` }))
        }))
      })),
      buttons: [
        { type: "button", action: "reset", icon: "fa-solid fa-rotate-left", label: "MBF.Table.Reset" },
        { type: "submit", icon: "fa-solid fa-floppy-disk", label: "MBF.Table.Save" }
      ]
    };
  }

  static async #onSubmit(event, form, formData) {
    await saveLootTable(foundry.utils.expandObject(formData.object));
    ui.notifications.info("MBF.Table.Saved", { localize: true });
  }

  static async #onReset() {
    await saveLootTable(foundry.utils.deepClone(DEFAULT_LOOT_TABLE));
    this.render();
  }
}

export function registerLootTableMenu() {
  game.settings.registerMenu(MODULE_ID, "lootTableMenu", {
    name: "MBF.Table.MenuName",
    label: "MBF.Table.MenuLabel",
    hint: "MBF.Table.MenuHint",
    icon: "fa-solid fa-table",
    type: LootTableEditor,
    restricted: true
  });
}
