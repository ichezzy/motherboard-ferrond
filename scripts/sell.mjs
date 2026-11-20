/**
 * Selling scrap – only with the GM's approval (in Ferrond you sell in town, at a scrap shack).
 *
 * The item menu (⋮) of a scrap item gets "Sell". The player picks how many, the GM gets
 * "Approve / Deny". Only on approval the pieces leave the inventory and their worth is added
 * to the matching currency: Shards → Bits, Metals → Bytes, Components → Chunks.
 */
import { QUERY, KINDS, salePrice, formatAmount } from "./data.mjs";
import { askGM, once, requireGM, esc } from "./gm.mjs";
import { scrapInfo } from "./scrap.mjs";

const { DialogV2 } = foundry.applications.api;
const L = key => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);

/** The GM has up to ten minutes to answer. */
const ANSWER_TIME = 10 * 60 * 1000;

export function registerSellQueries() {
  CONFIG.queries[QUERY.sell] = handleSell;
}

/** Hook "getCharacterSheetContextOptions": add "Sell" for scrap items. */
export function addSellOption(app, options) {
  options.push({
    label: "MBF.Sell.Menu",
    icon: '<i class="fa-solid fa-hand-holding-dollar"></i>',
    visible: target => {
      const item = itemFromTarget(target);
      return Boolean(item?.isOwner && scrapInfo(item) && (item.system.quantity ?? 0) > 0);
    },
    onClick: (event, target) => {
      const item = itemFromTarget(target);
      if (item) startSale(item);
    }
  });
}

function itemFromTarget(target) {
  const uuid = target?.closest?.("[data-item-uuid]")?.dataset.itemUuid;
  if (!uuid) return null;
  const item = fromUuidSync(uuid);
  return item?.documentName === "Item" ? item : null;
}

/* -------------------------------------------- */
/*  Player: how many?                           */
/* -------------------------------------------- */

async function startSale(item) {
  const info = scrapInfo(item);
  if (!info) return;
  const kind = KINDS[info.kind];
  const max = item.system.quantity ?? 0;
  if (max < 1) return;

  const content = `
    <p>${esc(F("MBF.Sell.Each", { name: item.name, price: formatAmount(info.value, kind.currency) }))}</p>
    <div class="form-group">
      <label>${esc(L("MBF.Sell.Quantity"))}</label>
      <div class="form-fields"><input type="number" name="quantity" value="${max}" min="1" max="${max}" step="1" autofocus></div>
    </div>
    ${game.user.isGM ? "" : `<p class="hint">${esc(L("MBF.Sell.NeedsGM"))}</p>`}`;

  const quantity = await DialogV2.prompt({
    window: { title: F("MBF.Sell.Title", { name: item.name }), icon: "fa-solid fa-hand-holding-dollar" },
    content,
    ok: {
      label: game.user.isGM ? "MBF.Sell.Sell" : "MBF.Sell.Ask",
      icon: "fa-solid fa-hand-holding-dollar",
      callback: (event, button) => button.form.elements.quantity.valueAsNumber
    },
    rejectClose: false
  });
  if (!Number.isInteger(quantity)) return;
  if (quantity < 1 || quantity > max) {
    ui.notifications.warn(F("MBF.Sell.BadQuantity", { max }));
    return;
  }

  if (!game.user.isGM) ui.notifications.info("MBF.Sell.Waiting", { localize: true });
  try {
    const result = await askGM(QUERY.sell, { itemUuid: item.uuid, quantity }, { timeout: ANSWER_TIME });
    if (result?.approved) {
      ui.notifications.info(F("MBF.Sell.Done", {
        quantity, name: item.name, price: formatAmount(result.amount, result.currency)
      }));
    } else ui.notifications.warn("MBF.Sell.Denied", { localize: true });
  } catch (err) {
    ui.notifications.error(err.message ?? String(err));
  }
}

/* -------------------------------------------- */
/*  GM: approve, then sell                      */
/* -------------------------------------------- */

async function handleSell({ itemUuid, quantity }, { user }) {
  requireGM();
  return once(`sell.${itemUuid}`, async () => {
    const item = await fromUuid(itemUuid);
    const info = scrapInfo(item);
    const actor = item?.parent;
    if (!info || actor?.documentName !== "Actor") throw new Error(L("MBF.Sell.NoItem"));
    if (!user.isGM && !actor.testUserPermission(user, "OWNER")) throw new Error(L("MBF.Sell.NotYours"));
    const qty = Math.trunc(Number(quantity));
    if (!(qty >= 1 && qty <= (item.system.quantity ?? 0))) throw new Error(F("MBF.Sell.BadQuantity", { max: item.system.quantity ?? 0 }));

    const { currency, amount } = salePrice(info.kind, info.value, qty);
    const price = formatAmount(amount, currency);

    // The GM decides. A sale the GM starts needs no second question.
    if (!user.isGM) {
      const approved = await DialogV2.confirm({
        window: { title: "MBF.Sell.RequestTitle", icon: "fa-solid fa-hand-holding-dollar" },
        content: `<p>${F("MBF.Sell.Request", {
          user: `<strong>${esc(user.name)}</strong>`,
          actor: `<strong>${esc(actor.name)}</strong>`,
          quantity: qty,
          name: `<strong>${esc(item.name)}</strong>`,
          price: `<strong>${esc(price)}</strong>`
        })}</p>`,
        yes: { label: "MBF.Sell.Approve", icon: "fa-solid fa-check" },
        no: { label: "MBF.Sell.Deny", icon: "fa-solid fa-xmark" },
        rejectClose: false
      });
      if (!approved) return { approved: false };
    }

    // Check again: the inventory may have changed while the GM was deciding.
    const fresh = actor.items.get(item.id);
    if (!fresh || (fresh.system.quantity ?? 0) < qty) throw new Error(L("MBF.Sell.Changed"));
    const rest = fresh.system.quantity - qty;
    if (rest > 0) await fresh.update({ "system.quantity": rest });
    else await fresh.delete();

    const path = `system.gold.${currency}`;
    await actor.update({ [path]: (Number(foundry.utils.getProperty(actor, path)) || 0) + amount });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p class="mbf-sale"><i class="fa-solid fa-hand-holding-dollar"></i> ${F("MBF.Sell.Chat", {
        actor: esc(actor.name), quantity: qty, name: esc(item.name), price: esc(price)
      })}</p>`
    });
    return { approved: true, amount, currency };
  });
}
