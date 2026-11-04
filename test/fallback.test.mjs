// If the best card is declined, the next-best card pays and the receipt says so. No PayPal calls: a fake payFn.
// Run: node test/fallback.test.mjs
import assert from 'node:assert/strict';
import { choose, Bad } from '../src/choose.mjs';
import { chargeInOrder } from '../src/cardbuddy.mjs';

const wallet = [
  { vaultId: 'v-dc', cardId: 'double-cash', isDefault: true },
  { vaultId: 'v-gold', cardId: 'amex-gold' },
  { vaultId: 'v-bcp', cardId: 'bcp' }
];
const purchase = { site: 'wholefoodsmarket.com', amount: 100, description: 'groceries' };
const c = choose(wallet, purchase);
const paid = { status: 'COMPLETED', captureStatus: 'COMPLETED' };

// 1. The best card (Blue Cash Preferred) is declined: the Amex Gold (also 6% at its point value) pays.
let r = await chargeInOrder(purchase, c, wallet, async ({ vaultId }) => vaultId === 'v-bcp' ? { status: 'COMPLETED', captureStatus: 'DECLINED' } : paid);
assert.equal(r.status, 'paid'); assert.equal(r.card, 'Amex Gold'); assert.deepEqual(r.declined, ['Amex Blue Cash Preferred']);
console.log('  declined BCP ->', r.card, r.percentBack + '%, $' + r.earned);

// 2. PayPal refuses outright (a 422 like PAYER_CANNOT_PAY): also falls through.
r = await chargeInOrder(purchase, c, wallet, async ({ vaultId }) => { if (vaultId !== 'v-dc') throw new Bad('PayPal said no (HTTP 422)'); return paid; });
assert.equal(r.status, 'paid'); assert.equal(r.card, 'Citi Double Cash'); assert.equal(r.declined.length, 2);
console.log('  refused BCP and Gold ->', r.card, r.percentBack + '%, $' + r.earned);

// 3. Every card declined: failed, nothing paid, all listed.
r = await chargeInOrder(purchase, c, wallet, async () => ({ status: 'COMPLETED', captureStatus: 'DECLINED' }));
assert.equal(r.status, 'failed'); assert.equal(r.attempts.length, 3);

// 4. The best card works: no fallback.
r = await chargeInOrder(purchase, c, wallet, async () => paid);
assert.equal(r.card, 'Amex Blue Cash Preferred'); assert.deepEqual(r.declined, []);

// 5. PayPal times out on the best card: stop, don't charge the next one (the first may have gone through).
r = await chargeInOrder(purchase, c, wallet, async () => { throw new DOMException('timed out', 'TimeoutError'); });
assert.equal(r.status, 'unknown'); assert.equal(r.attempts.length, 1);

// 6. A PENDING capture is paid, not declined: no second card is charged.
r = await chargeInOrder(purchase, c, wallet, async () => ({ status: 'COMPLETED', captureStatus: 'PENDING' }));
assert.equal(r.status, 'paid'); assert.equal(r.attempts.length, 1);

console.log('fallback ok');
