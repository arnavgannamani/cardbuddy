// The demo store end to end through the agent's tools, with no PayPal calls: the person names what to buy, the agent
// searches the store and checks out, and the store's total is paid on the best card or held.
// Run: node test/shop.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbuddy-shop-test-'));
const PORT = 4380 + Math.floor(Math.random() * 9);
fs.writeFileSync(path.join(DATA, 'wallet.json'), JSON.stringify([
  { vaultId: 'test-dc', cardId: 'double-cash', card: 'Citi Double Cash', brand: 'MASTERCARD', last4: '0011', isDefault: true },
  { vaultId: 'test-gold', cardId: 'amex-gold', card: 'Amex Gold', brand: 'VISA', last4: '0026', isDefault: false },
  { vaultId: 'test-bcp', cardId: 'bcp', card: 'Amex Blue Cash Preferred', brand: 'VISA', last4: '1881', isDefault: false }
]));
// A realistic budget, so only the rules this test is about hold anything.
fs.writeFileSync(path.join(DATA, 'policy.json'), JSON.stringify({ perPurchase: 100, monthlyBudget: 2500, approveCategories: ['travel'] }));
// GMAIL_USER set but empty: it wins over .env, so a test never emails anyone.
const env = { ...process.env, PORT: String(PORT), CARDBUDDY_DRY_RUN: '1', CARDBUDDY_DATA: DATA, CARDBUDDY_URL: 'http://localhost:' + PORT, GMAIL_USER: '', GMAIL_APP_PASSWORD: '' };

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

try {
  await rpc('initialize', { protocolVersion: '2025-06-18' });

  const groceries = await call('search_store', { query: 'my weekly groceries' });
  assert.equal(groceries.results[0].id, 'gl-basket'); assert.equal(groceries.results[0].store, 'Greenleaf Market');
  console.log(`  "my weekly groceries" -> ${groceries.results[0].name}, $${groceries.results[0].price} at ${groceries.results[0].store}`);

  const g = await call('checkout', { items: [{ id: 'gl-basket' }] });
  assert.equal(g.status, 'paid'); assert.equal(g.cart.total, 86.40); assert.equal(g.card, 'Amex Blue Cash Preferred'); assert.equal(g.percentBack, 6);
  console.log(`  checkout groceries: $${g.cart.total} paid on ${g.card} (${g.percentBack}%), $${g.earned} vs $${g.defaultEarned}`);

  const dinner = (await call('search_store', { query: 'thai dinner' })).results[0];
  const d = await call('checkout', { items: [{ id: dinner.id }] });
  assert.equal(d.status, 'paid'); assert.equal(d.card, 'Amex Gold'); assert.equal(d.cart.total, Math.round((31.50 * 1.08 + 2.99) * 100) / 100);
  console.log(`  checkout dinner: $${d.cart.total} (tax and delivery included) on ${d.card}`);

  const tv = (await call('search_store', { query: '65 inch tv' })).results[0];
  assert.equal(tv.id, 'vl-tv65');
  const t = await call('checkout', { items: [{ id: tv.id }] });
  assert.equal(t.status, 'needs_approval'); assert.match(t.reasons.join(' '), /per-purchase limit/);
  console.log(`  checkout TV: $${t.cart.total} held: ${t.reasons.join('; ')}`);

  // The person said "keep it under $40": a total above it waits for them, even under the per-purchase limit.
  const c = await call('checkout', { items: [{ id: 'gl-coffee', quantity: 2 }, { id: 'gl-towels' }], maxTotal: 40 });
  assert.equal(c.status, 'needs_approval'); assert.equal(c.cart.total, 40.47); assert.match(c.reasons.join(' '), /more than the \$40\.00 you set/);
  console.log(`  over the person's own $40 limit: held: ${c.reasons[0]}`);
  // The person declines it from the Approvals page (the browser sends its Origin); while it waited, any other
  // Greenleaf order would have waited too.
  await fetch(env.CARDBUDDY_URL + '/api/decline', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: env.CARDBUDDY_URL }, body: JSON.stringify({ id: c.pendingId }) });
  const ok = await call('checkout', { items: [{ id: 'gl-oatmilk', quantity: 2 }], maxTotal: 40 });
  assert.equal(ok.status, 'paid');
  console.log(`  under it ($${ok.cart.total}): paid`);

  assert.match((await call('checkout', { items: [{ id: 'gl-bananas' }, { id: 'vl-hdmi' }] })).error, /one store at a time/);
  assert.match((await call('checkout', { items: [{ id: 'nope' }] })).error, /No item/);
  assert.match((await call('checkout', { items: [{ id: 'gl-bananas', quantity: 0 }] })).error, /quantity/);
  assert.equal((await call('search_store', { query: 'zzzz' })).results.length, 0);
  console.log('  bad carts are refused');
  console.log('shop: all passed');
} finally {
  mcp.kill(); server.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
}
