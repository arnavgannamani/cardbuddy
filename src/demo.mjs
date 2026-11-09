// "Run the demo agent": plays the purchases an agent makes in the video, so someone without an MCP agent (a judge on
// the hosted demo) can see CardBuddy pick cards and hold purchases. With PayPal sandbox keys the two paid purchases are
// real sandbox orders; in dry run PayPal is never called. Each run starts a clean history (receipts, held purchases,
// declines), keeping the old one in data/archive-<time>.json, and keeps the wallet and rules.
import { load, save } from './store.mjs';
import { checkout, pay } from './cardbuddy.mjs';
import { Bad } from './choose.mjs';

const STEPS = [
  { ask: 'Order my weekly groceries', run: () => checkout({ items: [{ id: 'gl-basket' }] }) },
  { ask: 'Get pad thai for dinner tonight', run: () => checkout({ items: [{ id: 'no-padthai' }] }) },
  { ask: 'Buy that 65-inch TV', run: () => checkout({ items: [{ id: 'vl-tv65' }] }) },
  // A store CardBuddy doesn't know, labelled "other" by the agent: the store-name model reads it as travel.
  { ask: 'Book one night at Seaside Lodge ($89)', run: () => pay({ amount: 89, merchant: 'Seaside Lodge', category: 'other', description: 'One night' }) }
];

export async function runDemo() {
  const old = { receipts: load('receipts'), pending: load('pending'), declined: load('declined') };
  // As npm run reset: a payment with no final result may have been charged, so it isn't cleared from this month.
  if (old.receipts.some(r => r.status === 'unknown' || r.status === 'processing')) throw new Bad('A payment has no final result yet. Check it on Receipts and in the PayPal sandbox before running the demo again.');
  if (old.receipts.length || old.pending.length || old.declined.length) save('archive-' + new Date().toISOString().replace(/[:.]/g, '-'), old);
  for (const name of ['receipts', 'pending', 'declined']) save(name, []);
  const steps = [];
  for (const s of STEPS) {
    const r = await s.run();
    steps.push(r.status === 'needs_approval'
      ? { ask: s.ask, held: true, reasons: r.reasons }
      : { ask: s.ask, held: false, card: r.card, amount: r.amount, earned: r.earned, defaultEarned: r.defaultEarned, paypalOrderId: r.dryRun ? null : r.paypal?.orderId || null });
  }
  return { steps };
}
