// Which card in the person's wallet earns the most on one purchase, and on which rail. Uses the PointMaxx engine's card
// terms (engine/engine.cjs, engine/cards.json) and the extension's one-purchase scorer (engine/pick.cjs).
//
// A rail is how the money moves:
//   card    the vaulted card is charged directly; the statement shows the merchant, so only the card's own rates apply.
//   paypal  paid with the PayPal wallet, funded by that card; the statement reads "PAYPAL *MERCHANT", so PayPal-checkout
//           bonuses apply (the PayPal Cashback Mastercard's 3%).
//   venmo   paid with Venmo; the Venmo Credit Card's 3% on Venmo checkout applies.
// CardBuddy pays on the card rail today. The other rails are scored so the receipt can say when they'd earn more.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../engine/engine.cjs');
require('../engine/pick.cjs');
export const E = globalThis.Engine;
const STORES = require('../engine/stores.json');
const RAILS = { card: name => name, paypal: name => 'PAYPAL *' + name, venmo: name => 'VENMO *' + name };
export const CATEGORIES = Object.keys(E.CAT_LABEL);

export class Bad extends Error {} // a problem with the caller's input, reported back rather than thrown as a crash

// The cards a person can hold (open or closed to new applicants), for the "which card is this?" picker.
export function holdable() { return E.HOLDABLE.map(c => ({ id: c.id, name: c.name, issuer: c.issuer, fee: c.fee })); }
export function cardName(id) { const c = E.HOLDABLE.find(x => x.id === id); return c ? c.name : null; }

// Where the purchase happens: a known store's name and category (engine/stores.json), or a merchant name plus the
// category the caller gives. A known store's category can't be overridden: calling delta.com "dining" would skip an
// always-ask rule on travel. For an unknown merchant the category is the agent's word, so the engine also reads the
// name itself (guess), and the rules check both: calling Spirit Airlines "other" doesn't skip the travel rule either.
export function storeFor({ merchant, site, category } = {}) {
  let host = null;
  if (site != null) {
    if (typeof site !== 'string' || site.length > 200) throw new Bad('site must be a website of up to 200 characters.');
    host = site.trim().toLowerCase().replace(/^https?:\/\//, '').split(/[/?#]/)[0];
    const key = globalThis.PointMaxxStore(STORES, host);
    if (key) return { name: STORES[key][0], cat: STORES[key][1], site: key, warn: STORES[key][2] || null, guess: null };
    if (merchant == null) merchant = host; // a site CardBuddy doesn't know: its address stands in for the store's name
  }
  if (!CATEGORIES.includes(category)) throw new Bad((host ? `CardBuddy doesn't know ${host}. ` : '') + 'Give a known site, or a category: ' + CATEGORIES.join(', ') + '.');
  if (typeof merchant !== 'string' || !merchant.trim() || merchant.length > 100) throw new Bad('merchant must be a name of up to 100 characters.');
  const name = merchant.trim().toUpperCase(), info = E.categoryInfo({ desc: name, key: E.merchantKey(name) });
  // Only a sure reading counts: a keyword rule, or the name model at its confidence threshold.
  const guess = (info.source === 'rule' || info.source === 'model') && info.cat !== category ? info.cat : null;
  return { name, cat: category, site: null, warn: null, guess };
}

// wallet: [{ vaultId, cardId, ... }]. Returns every (rail, card) option sorted by percent back, the best card-rail
// option (what CardBuddy pays with), and what the wallet's default card would earn.
export function choose(wallet, purchase, date = new Date()) {
  if (!Array.isArray(wallet) || !wallet.length) throw new Bad('The wallet is empty. Connect a card first.');
  const store = storeFor(purchase), owned = [...new Set(wallet.map(w => w.cardId))];
  const options = [];
  for (const [rail, label] of Object.entries(RAILS)) {
    for (const r of globalThis.PointMaxxPick(owned, {}, { name: label(store.name), cat: store.cat }, date)) {
      options.push({ rail, cardId: r.card.id, card: r.card.name, percentBack: Math.round(r.back * 100) / 100, why: r.why, cap: r.cap, cash: r.card.unit === 'cash' });
    }
  }
  // Ties go to the card rail, then to cash back over points: cash is certain, a point's worth depends on how it's spent.
  const onCardRail = o => (o.rail === 'card' ? 1 : 0);
  options.sort((a, b) => b.percentBack - a.percentBack || onCardRail(b) - onCardRail(a) || b.cash - a.cash);
  const onCard = options.filter(o => o.rail === 'card');
  const best = onCard[0], top = options[0];
  const defaultEntry = wallet.find(w => w.isDefault) || wallet[0];
  const asDefault = onCard.find(o => o.cardId === defaultEntry.cardId);
  return {
    category: store.cat, categoryLabel: E.CAT_LABEL[store.cat], store: store.name, site: store.site, warning: store.warn, guessedCategory: store.guess,
    best: { ...best, vaultId: wallet.find(w => w.cardId === best.cardId).vaultId },
    defaultCard: { card: asDefault.card, percentBack: asDefault.percentBack },
    // Another rail beats the best card, say paying with PayPal on the PayPal Cashback Mastercard: worth telling.
    betterRail: top.rail !== 'card' && top.percentBack > best.percentBack ? top : null,
    options
  };
}
