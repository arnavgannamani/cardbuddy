// Step 1: does CardBuddy pick the right card from a wallet? No PayPal calls. Run: node test/choose.test.mjs
import assert from 'node:assert/strict';
import { choose } from '../src/choose.mjs';
import { check } from '../src/policy.mjs';

const wallet = [
  { vaultId: 'v-dc', cardId: 'double-cash', isDefault: true },
  { vaultId: 'v-gold', cardId: 'amex-gold' },
  { vaultId: 'v-bcp', cardId: 'bcp' },
  { vaultId: 'v-pp', cardId: 'paypal-cashback-mastercard' }
];
const show = c => console.log(`  ${c.store} (${c.categoryLabel}): ${c.best.card} ${c.best.percentBack}%, default ${c.defaultCard.card} ${c.defaultCard.percentBack}%` + (c.betterRail ? `; ${c.betterRail.rail} on ${c.betterRail.card} would be ${c.betterRail.percentBack}%` : ''));

let c = choose(wallet, { site: 'doordash.com', amount: 40 });
show(c);
assert.equal(c.best.card, 'Amex Gold'); assert.equal(c.best.vaultId, 'v-gold'); assert.equal(c.defaultCard.card, 'Citi Double Cash');

c = choose(wallet, { site: 'wholefoodsmarket.com', amount: 120 });
show(c);
assert.equal(c.best.card, 'Amex Blue Cash Preferred');

c = choose(wallet, { merchant: 'Demo Electronics', category: 'other', amount: 300 });
show(c);
assert.equal(c.best.card, 'Citi Double Cash');
assert.equal(c.betterRail && c.betterRail.card, 'PayPal Cashback Mastercard'); // 3% when paid through PayPal

assert.throws(() => choose([], { site: 'doordash.com' }), /wallet is empty/);
assert.throws(() => choose(wallet, { merchant: 'X' }), /category/);

const policy = { perPurchase: 100, monthlyBudget: 500, approveCategories: ['travel'] };
assert.equal(check(policy, [], { amount: 40, category: 'dining' }).ok, true);
assert.equal(check(policy, [], { amount: 300, category: 'other' }).ok, false);
assert.equal(check(policy, [], { amount: 20, category: 'travel' }).ok, false);

// Store rules: a repeat, a split, a store with a purchase already waiting, and a merchant the agent mislabels.
const now = new Date(), minsAgo = m => new Date(now - m * 60e3).toISOString();
const paidHere = [{ status: 'paid', at: minsAgo(10), amount: 100, merchant: 'BESTBUY.COM' }];
const why = (receipts, p, pending) => check(policy, receipts, p, now, pending).reasons.join('; ');
assert.match(why(paidHere, { amount: 100, category: 'online', store: 'BESTBUY.COM' }), /already paid at BESTBUY.COM in the last 24 hours/);
assert.match(why(paidHere, { amount: 60, category: 'online', store: 'BESTBUY.COM' }), /in the last hour, it comes to \$160.00/);
assert.equal(check(policy, paidHere, { amount: 60, category: 'online', store: 'TARGET.COM' }, now).ok, true);
assert.match(why([], { amount: 50, category: 'online', store: 'BESTBUY.COM' }, [{ store: 'BESTBUY.COM', purchase: { amount: 300 } }]), /\$300.00 purchase at BESTBUY.COM is already waiting/);
const spirit = choose(wallet, { merchant: 'Spirit Airlines', category: 'other', amount: 30 });
assert.equal(spirit.guessedCategory, 'travel');
assert.match(why([], { amount: 30, category: 'other', guessedCategory: spirit.guessedCategory, store: spirit.store }), /reads SPIRIT AIRLINES as travel/);
assert.equal(choose(wallet, { site: 'tinyshop-example.xyz', category: 'online', amount: 5 }).store, 'TINYSHOP-EXAMPLE.XYZ'); // unknown site, no merchant
assert.throws(() => choose(wallet, { site: 'tinyshop-example.xyz', amount: 5 }), /doesn't know tinyshop-example.xyz/);

console.log('step 1 ok: card choice and spending rules');
