// The agent's MCP server end to end, with no PayPal calls: starts AgentPay in dry-run mode on a throwaway wallet,
// then talks to mcp/server.mjs the way an agent's host does (JSON-RPC lines on stdin/stdout).
// Run: node test/mcp.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'agentpay-test-'));
const PORT = 4390 + Math.floor(Math.random() * 9);
fs.writeFileSync(path.join(DATA, 'wallet.json'), JSON.stringify([
  { vaultId: 'test-dc', cardId: 'double-cash', card: 'Citi Double Cash', brand: 'MASTERCARD', last4: '0011', isDefault: true },
  { vaultId: 'test-gold', cardId: 'amex-gold', card: 'Amex Gold', brand: 'VISA', last4: '0026', isDefault: false },
  { vaultId: 'test-bcp', cardId: 'bcp', card: 'Amex Blue Cash Preferred', brand: 'VISA', last4: '1881', isDefault: false }
]));
// A payment cut off by a crash last year: on start, AgentPay marks it unknown instead of leaving it "processing".
fs.writeFileSync(path.join(DATA, 'receipts.json'), JSON.stringify([
  { id: 'cut-off', status: 'processing', at: new Date(Date.now() - 400 * 864e5).toISOString(), merchant: 'WHOLE FOODS MARKET', description: 'cut off', amount: 12, card: 'Amex Blue Cash Preferred', percentBack: 6, earned: 0.72, defaultCard: 'Citi Double Cash', defaultEarned: 0.24, attempts: [], declined: [] }
]));
// GMAIL_USER set but empty: it wins over .env, so a test never emails anyone.
const env = { ...process.env, PORT: String(PORT), AGENTPAY_DRY_RUN: '1', AGENTPAY_DATA: DATA, AGENTPAY_URL: 'http://localhost:' + PORT, GMAIL_USER: '', GMAIL_APP_PASSWORD: '' };

const server = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, no) => { server.stdout.on('data', d => String(d).includes('running') && ok()); server.on('exit', no); });
const mcp = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.mjs')], { env, stdio: ['pipe', 'pipe', 'inherit'] });

let next = 1, buf = '';
const waiting = new Map();
mcp.stdout.setEncoding('utf8');
mcp.stdout.on('data', d => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); waiting.get(m.id)?.(m); }
});
const rpc = (method, params) => new Promise(ok => { const id = next++; waiting.set(id, ok); mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const call = async (name, args) => { const r = (await rpc('tools/call', { name, arguments: args })).result; return r.isError ? { error: r.content[0].text } : r.structuredContent; };
// The person, from the approvals page (the browser sends its Origin). Without it, approve is refused.
const post = (p, body, headers = { Origin: env.AGENTPAY_URL }) => fetch(env.AGENTPAY_URL + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

try {
  const init = (await rpc('initialize', { protocolVersion: '2025-06-18' })).result;
  assert.equal(init.serverInfo.name, 'agentpay');
  const tools = (await rpc('tools/list')).result.tools.map(t => t.name);
  assert.deepEqual(tools, ['get_wallet', 'recommend_card', 'pay', 'purchase_status', 'list_receipts', 'spending_rules']);
  console.log('  tools:', tools.join(', '));

  const w = await call('get_wallet', {});
  assert.equal(w.cards.length, 3); assert.ok(!JSON.stringify(w).includes('test-')); // vault ids never reach the agent
  console.log('  wallet: 3 cards, no vault ids');

  const rec = await call('recommend_card', { amount: 86.25, site: 'wholefoodsmarket.com' });
  assert.equal(rec.card, 'Amex Blue Cash Preferred'); assert.equal(rec.percentBack, 6);
  console.log(`  recommend: ${rec.card} ${rec.percentBack}% ($${rec.earns} vs $${rec.defaultEarns} on ${rec.defaultCard})`);

  const paid = await call('pay', { amount: 86.25, site: 'wholefoodsmarket.com', description: 'Weekly groceries' });
  assert.equal(paid.status, 'paid'); assert.equal(paid.card, 'Amex Blue Cash Preferred'); assert.equal(paid.dryRun, true);
  console.log(`  pay $86.25 groceries: paid with ${paid.card}, earned $${paid.earned} (dry run, order ${paid.paypalOrderId})`);

  const held = await call('pay', { amount: 1249, site: 'bestbuy.com', description: 'TV' });
  assert.equal(held.status, 'needs_approval'); assert.ok(held.pendingId);
  console.log('  pay $1,249 TV: held —', held.reasons.join('; '));
  assert.equal((await call('purchase_status', { pendingId: held.pendingId })).status, 'waiting_for_approval');
  await post('/api/decline', { id: held.pendingId });
  assert.equal((await call('purchase_status', { pendingId: held.pendingId })).status, 'declined');
  console.log('  person declined it: purchase_status says declined');

  const flight = await call('pay', { amount: 89, site: 'delta.com', description: 'Flight change fee' });
  assert.equal(flight.status, 'needs_approval');
  assert.equal((await post('/api/approve', { id: flight.pendingId }, {})).status, 403); // the agent's shell can't approve it
  assert.equal((await call('pay', { amount: 89, site: 'delta.com', category: 'dining', description: 'x' })).status, 'needs_approval'); // nor call it dining
  await post('/api/approve', { id: flight.pendingId });
  const s = await call('purchase_status', { pendingId: flight.pendingId });
  assert.equal(s.status, 'approved_and_paid'); assert.equal(s.receipt.amount, 89);
  console.log(`  $89 flight (travel asks first): approved, paid with ${s.receipt.card}`);

  const rules = await call('spending_rules', {});
  assert.equal(rules.spentThisMonth, 175.25);
  console.log(`  rules: $${rules.perPurchase} a purchase, $${rules.monthlyBudget} a month, $${rules.leftThisMonth} left`);
  const listed = (await call('list_receipts', { limit: 5 })).receipts;
  assert.equal(listed.length, 3); assert.equal(listed.find(r => r.description === 'cut off').status, 'unknown');
  console.log('  a payment cut off by a restart shows as unknown');

  // A split: $60 twice at one store within the hour (and a repeat of the same amount) waits for approval.
  assert.equal((await call('pay', { amount: 60, site: 'doordash.com', description: 'Dinner, part 1' })).status, 'paid');
  const split = await call('pay', { amount: 60, site: 'doordash.com', description: 'Dinner, part 2' });
  assert.equal(split.status, 'needs_approval'); assert.match(split.reasons.join(), /last hour/);
  // An airline called "other" still trips the travel rule.
  const spirit = await call('pay', { amount: 30, merchant: 'Spirit Airlines', category: 'other', description: 'Seat fee' });
  assert.equal(spirit.status, 'needs_approval'); assert.match(spirit.reasons.join(), /reads SPIRIT AIRLINES as travel/);
  console.log('  split order and mislabelled airline: both held');

  assert.match((await call('pay', { amount: 5, site: 'x.com', description: 'x', perPurchase: 9999 })).error, /Unknown argument/); // can't pass rule changes
  assert.match((await call('pay', { amount: 5, description: 'x' })).error, /site|merchant/);
  console.log('  bad arguments are refused');
  console.log('mcp: all passed');
} finally {
  mcp.kill(); server.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
}
