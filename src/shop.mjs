// The demo store: fictional shops with a catalog, standing in for the PayPal merchants an agent shops at. The agent
// searches it and checks out a cart; the store works out the total (tax and delivery included), and CardBuddy pays that
// total through pay(), so the person never has to know the price. With real merchants the total would come from the
// merchant's own checkout instead.
import { createRequire } from 'node:module';
import { Bad } from './choose.mjs';

const { stores: STORES } = createRequire(import.meta.url)('./shop-catalog.json');
const money = x => Math.round(x * 100) / 100;
const words = s => String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const ITEMS = new Map(STORES.flatMap(s => s.items.map(i => [i.id, { ...i, store: s }])));

export function catalog() {
  return STORES.map(({ id, name, category, about, taxRate, delivery, items }) => ({ id, name, category, about, taxRate, delivery, items: items.map(({ id, name, price }) => ({ id, name, price })) }));
}

// Items whose name, tags or store match the query's words, best match first. store narrows it to one shop.
export function search({ query, store } = {}) {
  if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Bad('query must be a few words describing what to buy (up to 200 characters).');
  if (store != null && !STORES.some(s => s.id === store || s.name.toLowerCase() === String(store).toLowerCase())) throw new Bad(`No demo store called "${String(store).slice(0, 50)}". Stores: ${STORES.map(s => s.name).join(', ')}.`);
  const q = words(query);
  const hits = [...ITEMS.values()]
    .filter(i => store == null || i.store.id === store || i.store.name.toLowerCase() === String(store).toLowerCase())
    .map(i => {
      const hay = new Set([...words(i.name), ...i.tags.flatMap(words), ...words(i.store.name), i.store.category]);
      return { i, score: q.filter(w => hay.has(w) || [...hay].some(h => h.startsWith(w) && w.length > 2)).length };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i.price - b.i.price)
    .slice(0, 8);
  return { results: hits.map(({ i }) => ({ id: i.id, name: i.name, price: i.price, store: i.store.name, storeId: i.store.id })) };
}

// The cart's total as the store would charge it. Items must all come from one store (one checkout per store).
export function quote(items) {
  if (!Array.isArray(items) || !items.length || items.length > 20) throw new Bad('items must be a list of 1 to 20 { id, quantity } from search_store.');
  const lines = items.map(x => {
    const item = ITEMS.get(x && x.id);
    if (!item) throw new Bad(`No item with id "${String(x && x.id).slice(0, 40)}". Use search_store to find items.`);
    const qty = x.quantity == null ? 1 : x.quantity;
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw new Bad('quantity must be a whole number from 1 to 20.');
    return { item, qty };
  });
  const store = lines[0].item.store;
  if (lines.some(l => l.item.store !== store)) throw new Bad('Check out one store at a time: these items come from more than one store.');
  const subtotal = money(lines.reduce((s, l) => s + l.item.price * l.qty, 0)), tax = money(subtotal * store.taxRate);
  return {
    store: store.name, storeId: store.id, category: store.category,
    items: lines.map(l => ({ id: l.item.id, name: l.item.name, quantity: l.qty, price: l.item.price, lineTotal: money(l.item.price * l.qty) })),
    subtotal, tax, delivery: store.delivery, total: money(subtotal + tax + store.delivery)
  };
}

// What the receipt and the approval request call the order: the item names, kept short.
export function describe(cart) {
  const names = cart.items.map(i => (i.quantity > 1 ? i.quantity + ' × ' : '') + i.name);
  const text = names.length > 2 ? names.slice(0, 2).join(', ') + ` and ${names.length - 2} more` : names.join(', ');
  return text.length > 120 ? text.slice(0, 117) + '…' : text;
}
