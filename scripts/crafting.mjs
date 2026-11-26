/**
 * Crafting yourself: projects with a progress countdown, and consumables in one roll.
 *
 * State on the actor: flags.motherboard-ferrond.crafting = { rollReady, projects: { <id>: project } }.
 * A roll becomes ready when the character takes "Work on a Project" in Daggerheart's long rest
 * dialog (or when the GM allows one). Everything runs on the owner's client; the chat shows it all.
 */
import { MODULE_ID } from "./data.mjs";
import { esc } from "./gm.mjs";
import { STAGES } from "./recipes.mjs";
import { addScrap } from "./scrap.mjs";
import {
  recipe, partsFor, piecesAffordable, startProblem, newProject, outcomeOf, nextProgress, consumableResult
} from "./crafting-rules.mjs";
import { blueprintKeys, scrapCounts, removeScrap, addProduct, partsText } from "./crafted-items.mjs";

const FLAG = "crafting";
const PATH = `flags.${MODULE_ID}.${FLAG}`;
export const CRAFTING_HOOK = `${MODULE_ID}.craftingChanged`;
const WORK_ON_A_PROJECT = "longRest.moves.workOnAProject";

const L = key => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);

export function craftingState(actor) {
  const state = actor?.getFlag(MODULE_ID, FLAG) ?? {};
  return { rollReady: Boolean(state.rollReady), projects: state.projects ?? {} };
}

export function actorTier(actor) {
  return actor?.type === "character" ? Number(actor.system.tier) || 1 : 1;
}

function requireOwner(actor) {
  if (!actor?.isOwner) throw new Error(L("MBF.Crafting.NotYours"));
}

async function chat(actor, html) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="mbf-crafting-chat"><i class="fa-solid fa-screwdriver-wrench"></i> ${html}</div>`
  });
}

const countsOf = parts => Object.fromEntries(parts.map(p => [p.key, p.count]));

/* -------------------------------------------- */
/*  Projects                                    */
/* -------------------------------------------- */

export async function startProject(actor, key) {
  requireOwner(actor);
  const r = recipe(key);
  if (!r || r.type === "consumable") throw new Error(L("MBF.Crafting.UnknownRecipe"));
  const problem = startProblem(r, { tier: actorTier(actor), blueprints: blueprintKeys(actor), have: scrapCounts(actor) });
  if (problem) throw new Error(L(problem));
  await removeScrap(actor, partsFor(r));
  const id = foundry.utils.randomID();
  await actor.update({ [`${PATH}.projects.${id}`]: newProject(r) });
  await chat(actor, F("MBF.Crafting.StartedChat", { actor: esc(actor.name), item: esc(r.name), parts: esc(partsText(r.parts)) }));
  return id;
}

export async function cancelProject(actor, id) {
  requireOwner(actor);
  const project = craftingState(actor).projects[id];
  if (!project) return;
  await addScrap(actor, countsOf(project.parts));
  await actor.update({ [`${PATH}.projects.${id}`]: _del });
  await chat(actor, F("MBF.Crafting.CancelledChat", { actor: esc(actor.name), item: esc(recipe(project.key)?.name ?? project.key) }));
}

/** GM: change a project's Difficulty. */
export async function setProjectDC(actor, id, dc) {
  if (!game.user.isGM) throw new Error(L("MBF.GM.OnlyGM"));
  const value = Math.max(1, Math.min(40, Math.trunc(Number(dc)) || 0));
  if (!craftingState(actor).projects[id] || !value) return;
  await actor.update({ [`${PATH}.projects.${id}.dc`]: value });
}

/** GM: allow (or take back) the long-rest roll by hand. */
export async function setRollReady(actor, ready) {
  if (!game.user.isGM) throw new Error(L("MBF.GM.OnlyGM"));
  await actor.update({ [`${PATH}.rollReady`]: Boolean(ready) });
}

/** Daggerheart's own Finesse action roll (dialog with Experiences, Hope and Fear as usual). */
async function finesseRoll(actor, dc, title) {
  const config = await actor.rollTrait("finesse", { title, roll: { type: "trait", trait: "finesse", difficulty: dc } });
  const roll = config?.evaluated;
  if (!roll) return null; // dialog closed
  // Like Daggerheart's own trait roll on the sheet: pay the costs (Hope for Experiences), then
  // apply Hope / Fear / Stress from the result.
  const costs = config.costs?.filter(c => c.enabled).map(c => ({ ...c, value: -c.value })) ?? [];
  if (config.resourceUpdates) {
    config.resourceUpdates.addResources(costs);
    await config.resourceUpdates.updateResources();
  }
  const isCritical = Boolean(roll.isCritical);
  return {
    total: roll.total,
    isCritical,
    withHope: Boolean(roll.withHope),
    success: isCritical || roll.total >= dc
  };
}

function needRoll(actor) {
  if (!craftingState(actor).rollReady) throw new Error(L("MBF.Crafting.NoRoll"));
}

export async function rollProject(actor, id) {
  requireOwner(actor);
  needRoll(actor);
  const project = craftingState(actor).projects[id];
  const r = recipe(project?.key);
  if (!r) throw new Error(L("MBF.Crafting.UnknownRecipe"));

  const result = await finesseRoll(actor, project.dc, F("MBF.Crafting.RollTitle", { item: r.name }));
  if (!result) return null;
  const outcome = outcomeOf(result);
  const progress = nextProgress(project.progress, project.start, outcome);
  const label = L(`MBF.Crafting.Outcome.${outcome}`);

  if (progress <= 0) {
    await actor.update({ [`${PATH}.rollReady`]: false, [`${PATH}.projects.${id}`]: _del });
    await addProduct(actor, r.key, 1);
    await chat(actor, F("MBF.Crafting.FinishedChat", { actor: esc(actor.name), item: esc(r.name), outcome: esc(label) }));
  } else {
    await actor.update({ [`${PATH}.rollReady`]: false, [`${PATH}.projects.${id}.progress`]: progress });
    await chat(actor, F("MBF.Crafting.ProgressChat", {
      actor: esc(actor.name), item: esc(r.name), outcome: esc(label), left: progress, start: project.start
    }));
  }
  return { outcome, progress };
}

/* -------------------------------------------- */
/*  Consumables                                 */
/* -------------------------------------------- */

export async function buildConsumables(actor, key, max) {
  requireOwner(actor);
  needRoll(actor);
  const r = recipe(key);
  if (r?.type !== "consumable") throw new Error(L("MBF.Crafting.UnknownRecipe"));
  const have = scrapCounts(actor);
  const problem = startProblem(r, { tier: actorTier(actor), blueprints: blueprintKeys(actor), have });
  if (problem) throw new Error(L(problem));
  const laidOut = Math.max(1, Math.min(Math.trunc(Number(max)) || 1, piecesAffordable(r, have)));

  const result = await finesseRoll(actor, r.roll.dc ?? STAGES.consumable.dc, F("MBF.Crafting.RollTitle", { item: r.name }));
  if (!result) return null;
  const outcome = outcomeOf(result);
  const { made, flawed } = consumableResult(outcome, actorTier(actor), laidOut);

  await removeScrap(actor, partsFor(r, made));
  await actor.update({ [`${PATH}.rollReady`]: false });
  if (made - flawed > 0) await addProduct(actor, key, made - flawed);
  if (flawed > 0) await addProduct(actor, key, flawed, { flawed: true });
  await chat(actor, F(flawed ? "MBF.Crafting.ConsumablesFlawedChat" : "MBF.Crafting.ConsumablesChat", {
    actor: esc(actor.name), count: made, item: esc(r.name), outcome: esc(L(`MBF.Crafting.Outcome.${outcome}`))
  }));
  return { outcome, made, flawed };
}

/* -------------------------------------------- */
/*  Long rest: "Work on a Project"              */
/* -------------------------------------------- */

/**
 * Hook "preCreateChatMessage": Daggerheart's downtime card lists the chosen moves
 * (system.moves[].movePath). "Work on a Project" during a long rest makes one crafting roll ready.
 */
export function watchDowntime(message, data, options, userId) {
  if (userId !== game.user.id) return;
  const moves = data?.system?.moves;
  if (!Array.isArray(moves) || !moves.some(m => m?.movePath === WORK_ON_A_PROJECT)) return;
  const actor = fromUuidSync(data.system.actor);
  if (actor?.documentName !== "Actor" || !actor.isOwner) return;
  actor.update({ [`${PATH}.rollReady`]: true }).then(() => {
    ui.notifications.info(F("MBF.Crafting.RollReadyNote", { actor: actor.name }));
  });
}
