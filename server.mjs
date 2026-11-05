// CardBuddy's local server: the "connect your wallet" page (PayPal card fields), approvals, receipts, and the JSON API
// they use. Listens on localhost only, unless hosted (CARDBUDDY_PUBLIC_URL): then the pages need the person's password
// and agents connect to /mcp with an API key. Usage: node server.mjs   (reads .env; PORT defaults to 4242)
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './src/env.mjs';
import * as ap from './src/cardbuddy.mjs';
import { catalog, search } from './src/shop.mjs';
import { holdable, CATEGORIES, E, Bad } from './src/choose.mjs';
import { createSetupToken } from './src/paypal.mjs';
import { alertsOn, alertsTo } from './src/notify.mjs';
import * as mcp from './mcp/server.mjs';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), 'web');
const PORT = Number(process.env.PORT || 4242);
if (process.argv.includes('--dry-run')) process.env.CARDBUDDY_DRY_RUN = '1'; // npm run dry
const PAGES = { '/': 'index.html', '/approvals': 'approvals.html', '/receipts': 'receipts.html', '/simulation': 'simulation.html', '/store': 'store.html' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2' }; // the charset keeps send() from re-encoding a file as JSON

const ROUTES = {
  'GET /api/config': () => ({ clientId: process.env.PAYPAL_CLIENT_ID || null, categories: CATEGORIES, labels: E.CAT_LABEL }),
  'GET /api/cards': () => holdable(),
  'GET /api/wallet': () => ap.wallet(),
  'POST /api/vault/setup-token': () => createSetupToken(),
  'POST /api/vault/payment-token': b => ap.addCard(b),
  'POST /api/wallet/remove': b => ap.removeCard(b),
  'POST /api/wallet/default': b => ap.setDefault(b),
  'POST /api/recommend': b => ap.recommend(b),
  'POST /api/pay': b => ap.pay(b),
  'GET /api/pending': () => ap.pending(),
  'POST /api/approve': b => ap.approve(b.id),
  'POST /api/decline': b => ap.decline(b.id),
  'POST /api/purchase-status': b => ap.purchaseStatus(b.id),
  'GET /api/receipts': () => ap.receipts(),
  'GET /api/policy': () => ap.policy(),
  'POST /api/policy': b => ap.setPolicy(b),
  // The demo store (src/shop.mjs): a fictional merchant the agent can search and check out at.
  'GET /api/shop': () => catalog(),
  'POST /api/shop/search': b => search(b),
  'POST /api/shop/checkout': b => ap.checkout(b)
};

// What the agent's MCP server calls. Every other POST (approve, decline, rules, cards) is the person's, from these pages.
const AGENT_ROUTES = new Set(['POST /api/recommend', 'POST /api/pay', 'POST /api/purchase-status', 'POST /api/shop/search', 'POST /api/shop/checkout']);
const HOSTS = ['localhost:' + PORT, '127.0.0.1:' + PORT], ORIGINS = HOSTS.map(h => 'http://' + h);

// Hosted: the public address joins the allowed hosts. The pages and the person's API need CARDBUDDY_PASSWORD (the
// sign-in page sets a cookie; curl can send it as Basic auth); agents get only the MCP tools at /mcp, with
// CARDBUDDY_KEY, so the key can't approve.
// ponytail: one shared wallet and one password for the whole demo; accounts per person if it ever serves real users.
const PUBLIC = (process.env.CARDBUDDY_PUBLIC_URL || '').replace(/\/+$/, ''), PASSWORD = process.env.CARDBUDDY_PASSWORD || '', KEY = process.env.CARDBUDDY_KEY || '';
if (PUBLIC) {
  if (PASSWORD.length < 12 || KEY.length < 24) { console.error('Hosted CardBuddy (CARDBUDDY_PUBLIC_URL) needs CARDBUDDY_PASSWORD (12+ characters) and CARDBUDDY_KEY (24+), e.g. from: openssl rand -hex 16'); process.exit(1); }
  HOSTS.push(new URL(PUBLIC).host); ORIGINS.push(new URL(PUBLIC).origin);
}
// Compared as hashes, so the time taken says nothing about how much of a guess was right.
const same = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(b).digest());
// ponytail: the cookie is a fixed HMAC of the password: changing the password signs everyone out; no per-session expiry.
const SESSION = crypto.createHmac('sha256', PASSWORD).update('cardbuddy-session').digest('hex');
const signedIn = req => {
  const c = /(?:^|;\s*)cb=([0-9a-f]{64})/.exec(req.headers.cookie || ''), m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  return (!!c && same(c[1], SESSION)) || (!!m && same(Buffer.from(m[1], 'base64').toString().split(':').slice(1).join(':'), PASSWORD));
};
// What the sign-in page itself needs, open to anyone.
const OPEN = /^\/(login|app\.css|mark\.svg|fonts\/[\w.-]+\.woff2)$/;
const safeNext = n => /^\/[\w/-]*$/.test(n || '') && !n.startsWith('//') ? n : '/';
const agentKey = req => { const m = /^Bearer (.+)$/.exec(req.headers.authorization || ''); return !!m && same(m[1], KEY); };

// The MCP tools at /mcp call the routes here directly, and only the agent's ones.
const AGENT_CAN = new Set([...AGENT_ROUTES, 'GET /api/wallet', 'GET /api/receipts', 'GET /api/policy']);
mcp.useApi(async (p, body) => {
  const key = (body ? 'POST ' : 'GET ') + p;
  if (!AGENT_CAN.has(key)) throw new Error('Not an agent route: ' + key);
  try { return JSON.parse(JSON.stringify(await ROUTES[key](body || {}))); } // the same copy an HTTP answer would be
  catch (e) { throw e instanceof Bad ? new mcp.Bad(e.message) : e; }
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', d => { s += d; if (s.length > 100000) { reject(new Bad('Request too large.')); req.destroy(); } });
    req.on('end', () => {
      let v; try { v = s ? JSON.parse(s) : {}; } catch { return reject(new Bad('Body must be JSON.')); }
      if (!v || typeof v !== 'object' || Array.isArray(v)) return reject(new Bad('Body must be a JSON object.'));
      resolve(v);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost'), key = req.method + ' ' + url.pathname;
  const send = (code, body, type = 'application/json', cache = 'no-store') => {
    // No framing: another site can't put the approvals page in an invisible frame and trick a click on Approve.
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" });
    res.end(type === 'application/json' ? JSON.stringify(body) : body);
  };
  // Only requests addressed to localhost: a site that rebinds its own domain to 127.0.0.1 can't read the wallet.
  if (!HOSTS.includes(req.headers.host)) return send(403, { error: 'Wrong host.' });
  // MCP over HTTP (Streamable HTTP, JSON answers only): one JSON-RPC message per POST.
  if (url.pathname === '/mcp' && KEY) {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(405, { error: 'POST one JSON-RPC message.' }); }
    if (req.headers.origin && !ORIGINS.includes(req.headers.origin)) return send(403, { error: 'Wrong origin.' });
    if (!agentKey(req)) { res.setHeader('WWW-Authenticate', 'Bearer'); return send(401, { error: 'Send the CardBuddy API key as Authorization: Bearer <key>.' }); }
    let msg; try { msg = await readBody(req); } catch (e) { return send(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: e.message } }); }
    const out = await mcp.handle(msg).catch(e => { console.error(e); return { jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32603, message: 'CardBuddy hit an internal error.' } }; });
    return out ? send(200, out) : send(202, '', 'text/plain');
  }
  if (PUBLIC && url.pathname === '/login') {
    if (req.method === 'POST') {
      let s = ''; for await (const d of req) { s += d; if (s.length > 2000) return send(400, 'Too large.', 'text/plain'); }
      const f = new URLSearchParams(s), next = safeNext(f.get('next'));
      if (!same(f.get('password') || '', PASSWORD)) { res.writeHead(303, { Location: '/login?wrong=1&next=' + encodeURIComponent(next) }); return res.end(); }
      res.writeHead(303, { Location: next, 'Set-Cookie': `cb=${SESSION}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800` });
      return res.end();
    }
    const html = fs.readFileSync(path.join(WEB, 'login.html'), 'utf8').replace('__NEXT__', safeNext(url.searchParams.get('next')))
      .replace('__WRONG__', url.searchParams.has('wrong') ? '<p class="wrong">That password isn\'t right.</p>' : '');
    return send(200, html, TYPES['.html']);
  }
  if (PUBLIC && !OPEN.test(url.pathname) && !signedIn(req)) {
    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) { res.writeHead(303, { Location: '/login?next=' + encodeURIComponent(safeNext(url.pathname)) }); return res.end(); }
    return send(401, { error: 'Sign in at /login first.' });
  }
  if (ROUTES[key]) {
    // Only these pages may call the API: no other site can drive payments from a visitor's browser. The person's
    // routes also need the page's Origin, so a plain curl from the agent's shell can't approve its own purchase.
    // ponytail: Origin is just a header, and an agent that sets it, or edits data/, gets past this. Rules the agent
    // truly can't skip need the agent kept off this machine's localhost and files, or a check only the person can pass.
    const origin = req.headers.origin;
    if (req.method === 'POST' && (origin ? !ORIGINS.includes(origin) : !AGENT_ROUTES.has(key))) return send(403, { error: 'Wrong origin.' });
    try { return send(200, await ROUTES[key](req.method === 'POST' ? await readBody(req) : {})); }
    catch (e) {
      if (e instanceof Bad) return send(400, { error: e.message });
      console.error(e);
      return send(500, { error: 'CardBuddy hit an internal error.' });
    }
  }
  const file = PAGES[url.pathname] || (/^\/(fonts\/)?[\w.-]+\.(js|css|svg|json|woff2)$/.test(url.pathname) ? url.pathname.slice(1) : null);
  if (req.method === 'GET' && file) {
    // Fonts and the mark are cached so moving between pages doesn't reload them and reflow the text; pages, CSS and
    // scripts are re-checked every time so an edit shows on refresh.
    const cache = /\.(woff2|svg)$/.test(file) ? 'public, max-age=604800' : 'no-cache';
    try { return send(200, fs.readFileSync(path.join(WEB, file)), TYPES[path.extname(file)], cache); } catch { /* fall through */ }
  }
  send(404, 'Not found', 'text/plain');
});
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`Port ${PORT} is already in use, probably by CardBuddy running in another terminal. Stop that one (Ctrl+C there) and start again.`);
  process.exit(1);
});
const cutOff = ap.recoverInterrupted();
if (cutOff) console.log(`${cutOff} payment${cutOff > 1 ? 's were' : ' was'} cut off when CardBuddy last stopped; marked unknown on Receipts. Check PayPal before paying again.`);
console.log(alertsOn() ? `Hold alerts: emailed to ${alertsTo()} through Gmail.` : 'Hold alerts: off (add GMAIL_USER and GMAIL_APP_PASSWORD to .env to get an email when a purchase waits for you).');
const seeded = ap.seedDemoWallet();
if (seeded === 'env') console.log('Empty wallet: loaded the cards in CARDBUDDY_WALLET.');
else if (seeded) console.log('Dry run with an empty wallet: added three demo cards (Citi Double Cash, Amex Gold, Blue Cash Preferred).');
// Hosted, it listens on every interface for the host's proxy; the Host check above still turns away any other name.
server.listen(PORT, PUBLIC ? '0.0.0.0' : '127.0.0.1', () => console.log('CardBuddy running at ' + (PUBLIC || 'http://localhost:' + PORT) + (process.env.CARDBUDDY_DRY_RUN === '1' ? ' (dry run: PayPal is never called)' : '') + (KEY ? '; agents connect to ' + (PUBLIC || 'http://localhost:' + PORT) + '/mcp' : '')));
