/**
 * World settings: the loot table (dice per player).
 */
import { MODULE_ID, DEFAULT_LOOT_TABLE, normalizeTable } from "./data.mjs";

export const LOOT_TABLE = "lootTable";

export function registerLootTableSetting() {
  game.settings.register(MODULE_ID, LOOT_TABLE, {
    scope: "world",
    config: false,
    type: Object,
    default: foundry.utils.deepClone(DEFAULT_LOOT_TABLE)
  });
}

/** The current table, always complete. */
export function lootTable() {
  return normalizeTable(game.settings.get(MODULE_ID, LOOT_TABLE));
}

export async function saveLootTable(table) {
  await game.settings.set(MODULE_ID, LOOT_TABLE, normalizeTable(table));
}
