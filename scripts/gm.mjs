/**
 * Asking the GM (Foundry User#query). The server forwards a query only to the GM it is meant for
 * and tells the GM who asks, so a player cannot pretend to be someone else. The GM's client checks
 * everything again before it changes a document.
 */
const L = key => game.i18n.localize(key);

/** Ask the active GM. A GM asks their own client directly. */
export async function askGM(name, data, { timeout = 30000 } = {}) {
  if (game.user.isGM) {
    const handler = CONFIG.queries[name];
    return handler(data, { user: game.user });
  }
  const gm = game.users.activeGM;
  if (!gm) throw new Error(L("MBF.GM.Offline"));
  return gm.query(name, data, { timeout });
}

/** Run a handler only once at a time per key (two clicks on the same thing). */
const busy = new Set();
export async function once(key, fn) {
  if (busy.has(key)) throw new Error(L("MBF.GM.Busy"));
  busy.add(key);
  try {
    return await fn();
  } finally {
    busy.delete(key);
  }
}

export function requireGM() {
  if (!game.user.isGM) throw new Error(L("MBF.GM.OnlyGM"));
}

/** Small HTML escaping for card and dialog text. */
export function esc(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}
