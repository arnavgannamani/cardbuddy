// AgentPay's local server: the "connect your wallet" page (PayPal card fields), approvals, receipts, and the JSON API
// they use. Listens on localhost only. Usage: node server.mjs   (reads .env; PORT defaults to 4242)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './src/env.mjs';
import * as ap from './src/agentpay.mjs';
import { holdable, CATEGORIES, E, Bad } from './src/choose.mjs';
import { createSetupToken } from './src/paypal.mjs';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), 'web');
const PORT = Number(process.env.PORT || 4242);
if (process.argv.includes('--dry-run')) process.env.AGENTPAY_DRY_RUN = '1'; // npm run dry
const PAGES = { '/': 'index.html', '/approvals': 'approvals.html', '/receipts': 'receipts.html', '/simulation': 'simulation.html' };
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
  'POST /api/policy': b => ap.setPolicy(b)
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', d => { s += d; if (s.length > 100000) { reject(new Bad('Request too large.')); req.destroy(); } });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Bad('Body must be JSON.')); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost'), key = req.method + ' ' + url.pathname;
  const send = (code, body, type = 'application/json', cache = 'no-store') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
  if (ROUTES[key]) {
    // Only this page may call the API: no other site can drive payments from a visitor's browser.
    if (req.method === 'POST' && req.headers.origin && req.headers.origin !== 'http://localhost:' + PORT) return send(403, { error: 'Wrong origin.' });
    try { return send(200, await ROUTES[key](req.method === 'POST' ? await readBody(req) : {})); }
    catch (e) {
      if (e instanceof Bad) return send(400, { error: e.message });
      console.error(e);
      return send(500, { error: 'AgentPay hit an internal error.' });
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
  console.error(`Port ${PORT} is already in use, probably by AgentPay running in another terminal. Stop that one (Ctrl+C there) and start again.`);
  process.exit(1);
});
server.listen(PORT, '127.0.0.1', () => console.log('AgentPay running at http://localhost:' + PORT + (process.env.AGENTPAY_DRY_RUN === '1' ? ' (dry run: PayPal is never called)' : '')));
