/**
 * Scrap release: the GM releases dice for each character, the players roll them.
 *
 * The release lives in the flags of one chat message (written only by the GM).
 * Each player sees inputs for their own characters on that card: typed results come from
 * physical dice at the table, empty fields are rolled in Foundry. The GM's client checks
 * the results, marks the entry as rolled and puts the scrap into the inventory.
 */
import {
  MODULE_ID, QUERY, KINDS, ICON_PATH, diceSlots, describeDice, isValidResult, itemForRoll,
  countByKey, formatAmount, scrapIcon
} from "./data.mjs";
import { askGM, once, requireGM, esc } from "./gm.mjs";
import { addScrap } from "./scrap.mjs";

const L = key => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);

export function registerReleaseQueries() {
  CONFIG.queries[QUERY.claim] = handleClaim;
}

/* -------------------------------------------- */
/*  Creating a release (GM)                     */
/* -------------------------------------------- */

/**
 * @param {string} label                  e.g. "Standard fight · Some remnants"
 * @param {{actor: Actor, dice: object}[]} rows
 */
export async function createRelease(label, rows) {
  requireGM();
  const entries = rows.map(({ actor, dice }) => {
    const empty = diceSlots(dice).length === 0;
    return {
      actorUuid: actor.uuid,
      name: actor.name,
      img: actor.img,
      dice: { shard: dice.shard ?? 0, metal: dice.metal ?? 0, component: dice.component ?? 0 },
      claimed: empty,
      results: [],
      by: null
    };
  });
  const release = { label, entries };
  return ChatMessage.create({
    speaker: { alias: L("MBF.Card.Speaker") },
    content: fallbackHtml(release),
    flags: { [MODULE_ID]: { release } }
  });
}

/** Plain text for the message itself (what you see if the module is ever switched off). */
function fallbackHtml(release) {
  const lines = release.entries.map(e => `<li>${esc(e.name)}: ${esc(describeDice(e.dice) || "–")}</li>`);
  return `<p><strong>${esc(L("MBF.Card.Title"))}</strong> – ${esc(release.label)}</p><ul>${lines.join("")}</ul>`;
}

/* -------------------------------------------- */
/*  The chat card                               */
/* -------------------------------------------- */

export function renderReleaseCard(message, html) {
  const release = message.getFlag(MODULE_ID, "release");
  if (!release) return;
  const content = html.querySelector(".message-content");
  if (!content) return;
  content.innerHTML = cardHtml(release);
  html.classList.add("mbf-scrap-message");

  for (const button of content.querySelectorAll("[data-mbf-action='claim']")) {
    button.addEventListener("click", event => {
      event.preventDefault();
      const entryEl = button.closest("[data-mbf-entry]");
      onClaim(message, Number(entryEl.dataset.mbfEntry), entryEl, button);
    });
  }
}

function cardHtml(release) {
  const rolled = release.entries.filter(e => e.claimed).length;
  const entries = release.entries.map((entry, index) => entryHtml(entry, index)).join("");
  const progress = game.user.isGM
    ? `<footer class="mbf-card-foot">${esc(F("MBF.Card.Progress", { done: rolled, total: release.entries.length }))}</footer>`
    : "";
  return `
    <div class="mbf-card">
      <header class="mbf-card-head">
        <img src="${ICON_PATH}/scrap/gear.webp" alt="">
        <div><strong>${esc(L("MBF.Card.Title"))}</strong><span>${esc(release.label)}</span></div>
      </header>
      <ol class="mbf-entries">${entries}</ol>
      ${progress}
    </div>`;
}

function entryHtml(entry, index) {
  const summary = describeDice(entry.dice) || L("MBF.Card.Nothing");
  const head = `
    <div class="mbf-entry-head">
      <img src="${esc(entry.img)}" alt="">
      <span class="mbf-entry-name">${esc(entry.name)}</span>
      <span class="mbf-entry-dice">${esc(summary)}</span>
    </div>`;

  let body;
  if (entry.claimed) {
    body = entry.results.length
      ? `<ul class="mbf-results">${entry.results.map(resultHtml).join("")}</ul>`
      : "";
  } else if (canAct(entry)) {
    const slots = diceSlots(entry.dice).map((slot, n) => {
      const die = KINDS[slot.kind].die;
      return `<label class="mbf-slot mbf-slot-${slot.kind}" data-tooltip="${esc(KINDS[slot.kind].label)} (d${die})">
          <span>d${die}</span>
          <input type="number" min="1" max="${die}" step="1" placeholder="–" data-slot="${n}" data-kind="${slot.kind}">
        </label>`;
    }).join("");
    body = `
      <div class="mbf-slots">${slots}</div>
      <p class="mbf-hint">${esc(L("MBF.Card.Hint"))}</p>
      <button type="button" class="mbf-claim" data-mbf-action="claim"><i class="fa-solid fa-dice"></i> ${esc(L("MBF.Card.Take"))}</button>`;
  } else {
    body = `<p class="mbf-waiting">${esc(L("MBF.Card.Waiting"))}</p>`;
  }
  return `<li class="mbf-entry${entry.claimed ? " mbf-claimed" : ""}" data-mbf-entry="${index}">${head}${body}</li>`;
}

function resultHtml(r) {
  const kind = KINDS[r.kind];
  const hand = r.manual ? ` <i class="fa-solid fa-hand" data-tooltip="${esc(L("MBF.Card.Typed"))}"></i>` : "";
  return `<li>
      <img src="${esc(scrapIcon(r.key))}" alt="">
      <span class="mbf-result-name">${esc(r.name)}</span>
      <span class="mbf-result-roll">d${kind.die}: ${r.roll}${hand}</span>
      <span class="mbf-result-worth">${esc(formatAmount(r.value, kind.currency))}</span>
    </li>`;
}

/** Owners of the character (and the GM) get the inputs. */
function canAct(entry) {
  if (game.user.isGM) return true;
  const actor = fromUuidSync(entry.actorUuid);
  return Boolean(actor?.isOwner);
}

/* -------------------------------------------- */
/*  Rolling (player)                            */
/* -------------------------------------------- */

async function onClaim(message, index, entryEl, button) {
  const release = message.getFlag(MODULE_ID, "release");
  const entry = release?.entries?.[index];
  if (!entry || entry.claimed) return;
  const slots = diceSlots(entry.dice);

  // Typed results (physical dice) – everything else is rolled here.
  const values = slots.map((slot, n) => {
    const raw = entryEl.querySelector(`input[data-slot='${n}']`)?.value?.trim() ?? "";
    return raw === "" ? null : Number(raw);
  });
  for (const [n, v] of values.entries()) {
    if (v !== null && !isValidResult(slots[n].kind, v)) {
      ui.notifications.warn(F("MBF.Card.BadInput", { die: KINDS[slots[n].kind].die }));
      return;
    }
  }

  button.disabled = true;
  try {
    const toRoll = values.map((v, n) => (v === null ? n : -1)).filter(n => n >= 0);
    if (toRoll.length) {
      const roll = await new Roll(toRoll.map(n => `1d${KINDS[slots[n].kind].die}`).join(" + ")).evaluate();
      roll.dice.forEach((die, i) => { values[toRoll[i]] = die.results[0].result; });
      if (game.dice3d) await game.dice3d.showForRoll(roll, game.user, true);
    }
    const results = slots.map((slot, n) => ({ kind: slot.kind, roll: values[n], manual: !toRoll.includes(n) }));
    await askGM(QUERY.claim, { messageId: message.id, index, results });
  } catch (err) {
    ui.notifications.error(err.message ?? String(err));
    button.disabled = false;
  }
}

/* -------------------------------------------- */
/*  Checking and handing out (GM)               */
/* -------------------------------------------- */

async function handleClaim({ messageId, index, results }, { user }) {
  requireGM();
  return once(`${messageId}.${index}`, async () => {
    const message = game.messages.get(messageId);
    const release = foundry.utils.deepClone(message?.getFlag(MODULE_ID, "release"));
    const entry = release?.entries?.[index];
    if (!entry) throw new Error(L("MBF.Claim.NoRelease"));
    if (entry.claimed) throw new Error(L("MBF.Claim.Already"));

    const actor = await fromUuid(entry.actorUuid);
    if (!actor) throw new Error(L("MBF.Claim.NoActor"));
    if (!user.isGM && !actor.testUserPermission(user, "OWNER")) throw new Error(L("MBF.Claim.NotYours"));

    const slots = diceSlots(entry.dice);
    if (!Array.isArray(results) || results.length !== slots.length) throw new Error(L("MBF.Claim.BadResult"));
    const checked = slots.map((slot, n) => {
      const r = results[n];
      const roll = Number(r?.roll);
      if (r?.kind !== slot.kind || !isValidResult(slot.kind, roll)) throw new Error(L("MBF.Claim.BadResult"));
      const item = itemForRoll(slot.kind, roll);
      return { kind: slot.kind, roll, manual: Boolean(r.manual), key: item.key, name: item.name, value: item.value };
    });

    // Mark first, then hand out: a second click can never pay twice.
    entry.claimed = true;
    entry.results = checked;
    entry.by = user.id;
    await message.setFlag(MODULE_ID, "release", release);
    await addScrap(actor, countByKey(checked));
    return { ok: true };
  });
}
