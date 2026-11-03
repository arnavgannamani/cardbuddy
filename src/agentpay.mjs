// What AgentPay does, shared by the web server (server.mjs) and the agent's MCP server (mcp/server.mjs): the wallet,
// choosing a card, paying within the policy, approvals, and receipts.
import { randomUUID } from 'node:crypto';
import { choose, cardName, Bad } from './choose.mjs';
import { check } from './policy.mjs';
import { load, save } from './store.mjs';
import * as paypal from './paypal.mjs';

const money = x => Math.round(x * 100) / 100;

export function wallet() {
  return load('wallet').map(({ vaultId, cardId, card, brand, last4, isDefault }) => ({ vaultId, cardId, card, brand, last4, isDefault: !!isDefault }));
}

// Adds a card the person saved through PayPal's card fields: the payment token PayPal made, and which card it is.
export async function addCard({ setupTokenId, cardId, makeDefault }) {
  if (!cardName(cardId)) throw new Bad('Pick which card this is from the list.');
  const t = await paypal.createPaymentToken(setupTokenId);
  const w = load('wallet');
  const entry = { vaultId: t.vaultId, customerId: t.customerId, cardId, card: cardName(cardId), brand: t.brand, last4: t.last4, expiry: t.expiry, isDefault: !w.length || !!makeDefault, addedAt: new Date().toISOString() };
  if (entry.isDefault) w.forEach(x => { x.isDefault = false; });
  w.push(entry);
  save('wallet', w);
  return { vaultId: entry.vaultId, card: entry.card, brand: entry.brand, last4: entry.last4, isDefault: entry.isDefault };
}

// Removes a card from the wallet and from PayPal's vault. If it was the default, the first card left becomes default.
export async function removeCard({ vaultId } = {}) {
  const w = load('wallet'), card = w.find(x => x.vaultId === vaultId);
  if (!card) throw new Bad('That card isn\'t in the wallet.');
  await paypal.deletePaymentToken(vaultId);
  const left = w.filter(x => x.vaultId !== vaultId);
  if (card.isDefault && left.length) left[0].isDefault = true;
  save('wallet', left);
  return { removed: card.card, wallet: wallet() };
}

export function setDefault({ vaultId } = {}) {
  const w = load('wallet');
  if (!w.some(x => x.vaultId === vaultId)) throw new Bad('That card isn\'t in the wallet.');
  w.forEach(x => { x.isDefault = x.vaultId === vaultId; });
  save('wallet', w);
  return wallet();
}

function parsePurchase(p = {}) {
  const amount = Number(p.amount);
  if (!isFinite(amount) || amount < 0.01 || amount > 10000) throw new Bad('amount must be from $0.01 to $10,000.');
  if (p.description != null && (typeof p.description !== 'string' || p.description.length > 120)) throw new Bad('description must be up to 120 characters.');
  return { merchant: p.merchant, site: p.site, category: p.category, amount: money(amount), description: p.description || '' };
}

// The card AgentPay would use, and why, without paying.
export function recommend(p) {
  const purchase = parsePurchase(p), c = choose(load('wallet'), purchase);
  return { ...c, earns: money(purchase.amount * c.best.percentBack / 100), defaultEarns: money(purchase.amount * c.defaultCard.percentBack / 100) };
}

function receiptFrom(purchase, c, extra) {
  return {
    id: randomUUID(), at: new Date().toISOString(), merchant: c.store, site: c.site, category: c.category, description: purchase.description,
    amount: purchase.amount, card: c.best.card, cardId: c.best.cardId, percentBack: c.best.percentBack, why: c.best.why,
    earned: money(purchase.amount * c.best.percentBack / 100),
    defaultCard: c.defaultCard.card, defaultEarned: money(purchase.amount * c.defaultCard.percentBack / 100),
    betterRail: c.betterRail ? { rail: c.betterRail.rail, card: c.betterRail.card, percentBack: c.betterRail.percentBack } : null,
    ...extra
  };
}

async function charge(purchase, c) {
  const receipts = load('receipts'), id = randomUUID();
  const r = await paypal.payWithVaultedCard({ vaultId: c.best.vaultId, amount: purchase.amount, description: purchase.description || c.store, invoiceId: id });
  const ok = r.status === 'COMPLETED' && (!r.captureStatus || r.captureStatus === 'COMPLETED');
  const receipt = { ...receiptFrom(purchase, c, { status: ok ? 'paid' : 'failed', paypal: r }), id };
  receipts.push(receipt);
  save('receipts', receipts);
  return receipt;
}

// Pays if the policy allows it; otherwise holds the purchase for approval and says why.
export async function pay(p) {
  const purchase = parsePurchase(p), c = choose(load('wallet'), purchase);
  const verdict = check(load('policy'), load('receipts'), { ...purchase, category: c.category });
  if (!verdict.ok) {
    const pending = load('pending');
    const held = { id: randomUUID(), at: new Date().toISOString(), purchase, card: c.best.card, percentBack: c.best.percentBack, reasons: verdict.reasons };
    pending.push(held);
    save('pending', pending);
    return { status: 'needs_approval', pendingId: held.id, reasons: verdict.reasons, card: c.best.card, approveAt: 'http://localhost:' + (process.env.PORT || 4242) + '/approvals' };
  }
  return charge(purchase, c);
}

export function pending() { return load('pending'); }

export async function approve(id) {
  const list = load('pending'), held = list.find(x => x.id === id);
  if (!held) throw new Bad('No purchase is waiting with that id.');
  save('pending', list.filter(x => x.id !== id));
  return charge(held.purchase, choose(load('wallet'), held.purchase));
}
export function decline(id) {
  const list = load('pending');
  if (!list.some(x => x.id === id)) throw new Bad('No purchase is waiting with that id.');
  save('pending', list.filter(x => x.id !== id));
  return { declined: id };
}

export function receipts() {
  const all = load('receipts'), paid = all.filter(r => r.status === 'paid');
  const earned = money(paid.reduce((s, r) => s + r.earned, 0)), defaultEarned = money(paid.reduce((s, r) => s + r.defaultEarned, 0));
  return { receipts: all.slice().reverse(), totals: { purchases: paid.length, spent: money(paid.reduce((s, r) => s + r.amount, 0)), earned, defaultEarned, extra: money(earned - defaultEarned) } };
}

export function policy() { return load('policy'); }
export function setPolicy(p = {}) {
  const cur = load('policy'), next = { ...cur };
  if (p.perPurchase != null) { if (!(p.perPurchase > 0 && p.perPurchase <= 10000)) throw new Bad('perPurchase must be from $1 to $10,000.'); next.perPurchase = Number(p.perPurchase); }
  if (p.monthlyBudget != null) { if (!(p.monthlyBudget > 0 && p.monthlyBudget <= 100000)) throw new Bad('monthlyBudget must be from $1 to $100,000.'); next.monthlyBudget = Number(p.monthlyBudget); }
  if (p.approveCategories != null) { if (!Array.isArray(p.approveCategories)) throw new Bad('approveCategories must be a list.'); next.approveCategories = p.approveCategories.map(String).slice(0, 20); }
  save('policy', next);
  return next;
}
