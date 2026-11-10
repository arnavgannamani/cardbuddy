// Hosted CardBuddy, with no PayPal calls: the pages need the password, agents get only the MCP tools at /mcp with the
// API key, and the key can't open the pages or approve. Run: node test/hosted.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbuddy-test-'));
const PORT = 4370 + Math.floor(Math.random() * 9), PUBLIC = 'https://cardbuddy.example', PASSWORD = 'test-password-123', KEY = 'test-key-0123456789abcdef';
const WALLET = [
  { vaultId: 'test-dc', cardId: 'double-cash', card: 'Citi Double Cash', brand: 'MASTERCARD', last4: '0011', isDefault: true },
  { vaultId: 'test-bcp', cardId: 'bcp', card: 'Amex Blue Cash Preferred', brand: 'VISA', last4: '1881', isDefault: false }
];
const env = { ...process.env, PORT: String(PORT), CARDBUDDY_DRY_RUN: '1', CARDBUDDY_DATA: DATA, CARDBUDDY_PUBLIC_URL: PUBLIC, CARDBUDDY_PASSWORD: PASSWORD, CARDBUDDY_KEY: KEY, CARDBUDDY_WALLET: JSON.stringify(WALLET), GMAIL_USER: '', GMAIL_APP_PASSWORD: '' };

// http.request, not fetch: it lets the test send the public Host header the host's proxy would.
const req = (method, p, { body, headers = {}, host = 'cardbuddy.example' } = {}) => new Promise((ok, no) => {
  const r = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: { Host: host, 'Content-Type': 'application/json', ...headers } }, res => {
    let s = ''; res.on('data', d => s += d); res.on('end', () => { let json; try { json = JSON.parse(s); } catch {} ok({ status: res.statusCode, headers: res.headers, json, text: s }); });
  });
  r.on('error', no); r.end(body === undefined ? undefined : JSON.stringify(body));
});
const person = { Authorization: 'Basic ' + Buffer.from('me:' + PASSWORD).toString('base64'), Origin: PUBLIC };
const agent = { Authorization: 'Bearer ' + KEY };
let id = 1;
const rpc = async (method, params, headers = agent) => (await req('POST', '/mcp', { body: { jsonrpc: '2.0', id: id++, method, params }, headers })).json;
const call = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result.structuredContent;

// Refuses to start hosted without a password and key.
const bare = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { env: { ...env, CARDBUDDY_KEY: '' }, stdio: 'ignore' });
assert.equal(await new Promise(ok => bare.on('exit', ok)), 1);
console.log('  hosted with no API key: refuses to start');

const server = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, no) => { server.stdout.on('data', d => String(d).includes('running') && ok()); server.on('exit', no); });

try {
  assert.equal((await req('GET', '/', { host: 'evil.example' })).status, 403);
  const page = await req('GET', '/approvals');
  assert.equal(page.status, 303); assert.equal(page.headers.location, '/login?next=%2Fapprovals');
  assert.equal((await req('GET', '/login?next=/approvals')).status, 200);
  assert.equal((await req('GET', '/api/wallet', { headers: agent })).status, 401); // the agent's key isn't the password
  const login = password => new Promise((ok, no) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, method: 'POST', path: '/login', headers: { Host: 'cardbuddy.example', 'Content-Type': 'application/x-www-form-urlencoded' } }, res => { res.resume(); ok(res); });
    r.on('error', no); r.end(`password=${encodeURIComponent(password)}&next=%2Fapprovals`);
  });
  assert.match((await login('wrong')).headers.location, /^\/login\?wrong=1/);
  const signin = await login(PASSWORD);
  assert.equal(signin.headers.location, '/approvals');
  const cookie = signin.headers['set-cookie'][0].split(';')[0];
  assert.equal((await req('GET', '/approvals', { headers: { Cookie: cookie } })).status, 200);
  person.Cookie = cookie; delete person.Authorization; // the rest of the test signs in the way a browser does
  console.log('  pages: other hosts 403, signed out goes to /login, the API key 401, a wrong password refused, signed in 200');

  assert.equal((await req('POST', '/mcp', { body: { jsonrpc: '2.0', id: 0, method: 'ping' } })).status, 401);
  assert.equal((await req('POST', '/mcp', { body: { jsonrpc: '2.0', id: 0, method: 'ping' }, headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await req('GET', '/mcp', { headers: agent })).status, 405);
  assert.equal((await req('POST', '/mcp', { body: { jsonrpc: '2.0', method: 'notifications/initialized' }, headers: agent })).status, 202);
  assert.equal((await req('POST', '/mcp', { body: { jsonrpc: '2.0', id: 0, method: 'ping' }, headers: { ...agent, Origin: 'https://evil.example' } })).status, 403);
  console.log('  /mcp: no key or a wrong one 401, GET 405, a notification 202, another site 403');

  assert.equal((await rpc('initialize', { protocolVersion: '2025-06-18' })).result.serverInfo.name, 'cardbuddy');
  assert.equal((await rpc('tools/list')).result.tools.length, 8);
  const w = await call('get_wallet', {});
  assert.equal(w.cards.length, 2); assert.ok(!JSON.stringify(w).includes('test-')); // from CARDBUDDY_WALLET, vault ids hidden
  console.log('  /mcp: 8 tools; wallet loaded from CARDBUDDY_WALLET, no vault ids');

  const groceries = await call('checkout', { items: [{ id: (await call('search_store', { query: 'weekly groceries' })).results[0].id }] });
  assert.equal(groceries.status, 'paid'); assert.equal(groceries.card, 'Amex Blue Cash Preferred');
  const tv = await call('pay', { amount: 1348.92, site: 'bestbuy.com', description: 'TV' });
  assert.equal(tv.status, 'needs_approval'); assert.equal(tv.approveAt, PUBLIC + '/approvals');
  console.log(`  /mcp: groceries paid on ${groceries.card}; the TV held, approve at ${tv.approveAt}`);

  assert.equal((await req('POST', '/api/approve', { body: { id: tv.pendingId }, headers: { ...agent, Origin: PUBLIC } })).status, 401);
  assert.equal((await rpc('tools/call', { name: 'approve', arguments: { id: tv.pendingId } })).error.code, -32602);
  assert.equal((await req('POST', '/api/approve', { body: { id: tv.pendingId }, headers: person })).status, 200);
  assert.equal((await call('purchase_status', { pendingId: tv.pendingId })).status, 'approved_and_paid');
  console.log('  the key can\'t approve; the person (password) approved it and it paid');

  // The demo agent: a clean history each run, the old one kept in an archive file.
  const demo = (await req('POST', '/api/demo/run', { body: {}, headers: person })).json;
  assert.deepEqual(demo.steps.map(s => s.held), [false, false, true, true]);
  assert.equal(demo.steps[0].card, 'Amex Blue Cash Preferred'); assert.equal(demo.steps[0].paypalOrderId, null); // dry run: no PayPal order
  assert.ok(fs.readdirSync(DATA).some(f => /^archive-.+\.json$/.test(f)));
  assert.equal((await req('GET', '/api/receipts', { headers: person })).json.receipts.length, 2);
  console.log('  demo agent: groceries and dinner paid, TV and hotel held; the old history archived');
} finally {
  server.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
}

// An open demo for judges: no password, so the pages open for anyone, but its cards can't be removed and /mcp still
// needs the key.
if (server.exitCode === null) await new Promise(ok => server.on('exit', ok));
const OPEN_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbuddy-test-'));
const open = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { env: { ...env, CARDBUDDY_DATA: OPEN_DATA, CARDBUDDY_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, no) => { open.stdout.on('data', d => String(d).includes('running') && ok()); open.on('exit', no); });
try {
  assert.equal((await req('GET', '/approvals')).status, 200);
  assert.equal((await req('GET', '/login?next=/receipts')).headers.location, '/receipts');
  const remove = await req('POST', '/api/wallet/remove', { body: { vaultId: 'test-dc' }, headers: { Origin: PUBLIC } });
  assert.equal(remove.status, 403); assert.equal((await req('GET', '/api/wallet')).json.length, 2);
  assert.equal((await req('POST', '/mcp', { body: { jsonrpc: '2.0', id: 0, method: 'ping' } })).status, 401);
  assert.equal((await req('GET', '/', { host: 'evil.example' })).status, 403);
  console.log('  open demo: pages open with no password, cards can\'t be removed, /mcp still needs the key');
} finally {
  open.kill();
  fs.rmSync(OPEN_DATA, { recursive: true, force: true });
}
console.log('hosted: all passed');
