// Step 1 of the CardBuddy demo video: does everything for real and records the CardBuddy pages.
//   node record.mjs
// - Starts a throwaway CardBuddy on port 4400 with a fresh data folder in the OS temp dir (never ../data), with email
//   alerts off. PayPal sandbox keys are read by server.mjs itself from ../.env; this script never reads them.
// - Sets the spending rules the way a person would, from the CardBuddy page (perPurchase 100, monthlyBudget 2500).
// - Wallet: types PayPal's sandbox test cards into PayPal's own card fields (real key events in PayPal's iframes).
// - The agent: spawns ../mcp/server.mjs (the agent's MCP tools) and calls search_store, checkout and purchase_status.
//   The person never says a price: the demo store (../src/shop.mjs) works out each total, tax and delivery included.
// - Approvals: clicks "Approve and pay" on the held TV like the person would. Receipts: shows the result.
// Writes build/run.json (every MCP request and response, plus timing marks) and build/live/*.jpg (a CDP screencast of
// the CardBuddy pages, each frame with its timestamp in build/live/frames.json). render.mjs turns these into the MP4.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), APP = path.join(HERE, '..');
const PORT = Number(process.env.DEMO_PORT || 4400), BASE = `http://localhost:${PORT}`;
const BUILD = path.join(HERE, 'build'), LIVE = path.join(BUILD, 'live');
const W = 1440, H = 810, SCALE = 1920 / 1440; // CSS viewport, recorded at 1920x1080

// The cards to add: PayPal's sandbox test numbers only, each standing for one real card the engine scores.
const CARDS = [
  { cardId: 'double-cash', label: 'Citi Double Cash', number: '2223000048400011', makeDefault: true },
  { cardId: 'amex-gold', label: 'Amex Gold', number: '4012000033330026' },
  { cardId: 'bcp', label: 'Amex Blue Cash Preferred', number: '4012888888881881' }
];
const NAME = 'Alex Rivera', EXPIRY = '1230', CVV = '123';
// What the agent looks for in the demo store (the agent's search_store queries for the person's three texts).
const BUYS = {
  groceries: { query: 'weekly groceries' },
  dinner: { query: 'pad thai dinner' },
  tv: { query: '65 inch tv' }
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const marks = {};
const mark = name => { marks[name] = Date.now() / 1000; console.log('mark', name); };
process.on('unhandledRejection', e => { console.error('ERROR', String(e && e.message || e).slice(0, 400)); cleanup().then(() => process.exit(1)); });

// ---------- the throwaway CardBuddy ----------
const portFree = p => new Promise(r => { const s = net.createServer().once('error', () => r(false)).once('listening', () => s.close(() => r(true))).listen(p, '127.0.0.1'); });
if (PORT === 4242) throw new Error('Port 4242 is the real CardBuddy. Use another port.');
if (!await portFree(PORT)) throw new Error(`Port ${PORT} is busy.`);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbuddy-demo-'));
if (path.resolve(DATA).startsWith(path.resolve(APP, 'data'))) throw new Error('Refusing to use the real data folder.');
fs.rmSync(BUILD, { recursive: true, force: true });
fs.mkdirSync(LIVE, { recursive: true });
const serverLog = fs.createWriteStream(path.join(BUILD, 'server.log'));
const env = { ...process.env, PORT: String(PORT), CARDBUDDY_DATA: DATA, GMAIL_USER: '', GMAIL_APP_PASSWORD: '' };
const srv = spawn(process.execPath, ['server.mjs'], { cwd: APP, env, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.pipe(serverLog); srv.stderr.pipe(serverLog);
for (let i = 0; ; i++) { try { await fetch(BASE + '/api/wallet'); break; } catch { if (i > 50) throw new Error('CardBuddy did not start.'); await sleep(200); } }
console.log('CardBuddy (demo) at', BASE, 'data in', DATA);

let browser, mcp;
async function cleanup() {
  try { if (browser) await browser.close(); } catch {}
  try { if (mcp) mcp.kill(); } catch {}
  try { if (srv.exitCode == null) { const gone = new Promise(r => srv.once('exit', r)); srv.kill(); await Promise.race([gone, sleep(5000)]); } } catch {}
  // The throwaway data folder (temp dir only, never ../data) goes once the server has stopped.
  try { fs.rmSync(DATA, { recursive: true, force: true }); console.log('removed', DATA); } catch (e) { console.error('could not remove', DATA, e.message); }
}

// ---------- the agent's MCP tools, over stdio ----------
mcp = spawn(process.execPath, [path.join(APP, 'mcp', 'server.mjs')], { cwd: APP, env: { ...process.env, CARDBUDDY_URL: BASE }, stdio: ['pipe', 'pipe', 'pipe'] });
let mbuf = '', nextId = 1; const waiting = new Map();
mcp.stdout.setEncoding('utf8');
mcp.stdout.on('data', d => { mbuf += d; let i; while ((i = mbuf.indexOf('\n')) >= 0) { const line = mbuf.slice(0, i); mbuf = mbuf.slice(i + 1); if (!line.trim()) continue; const m = JSON.parse(line); waiting.get(m.id)?.(m); waiting.delete(m.id); } });
mcp.stderr.on('data', d => serverLog.write('[mcp] ' + d));
const rpc = (method, params) => new Promise(r => { const id = nextId++; waiting.set(id, r); mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const calls = [];
async function tool(name, args) {
  const at = Date.now() / 1000, res = await rpc('tools/call', { name, arguments: args });
  if (res.error || res.result.isError) throw new Error(`${name} failed: ${JSON.stringify(res.error || res.result.content)}`);
  const out = res.result.structuredContent;
  calls.push({ name, arguments: args, at, ms: Math.round((Date.now() / 1000 - at) * 1000), result: out });
  console.log('tool', name, JSON.stringify(out).slice(0, 300));
  return out;
}
await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'demo-agent', version: '0.0.1' } });

// ---------- the browser, with a visible pointer and a caption ----------
// The screencast is in device pixels only when Chrome itself runs at the scale factor: 1440x810 CSS → 1920x1080 frames.
browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--force-device-scale-factor=' + SCALE] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: SCALE, bypassCSP: true,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
});
// Recording overlays only (a pointer and a caption bar), added to the page in the browser; CardBuddy's files are untouched.
await ctx.addInitScript(() => {
  if (window.top !== window) return;
  let cur, ring, cap, pos = { x: 760, y: 470 };
  function ensure() {
    if (cur && document.body && document.body.contains(cur)) return;
    cur = document.createElement('div');
    cur.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:22px;height:30px;will-change:transform';
    cur.innerHTML = '<svg width="22" height="30" viewBox="0 0 22 30"><path d="M2 2 L2 23 L7.5 18 L11.5 27 L15 25.5 L11 16.8 L18 16.8 Z" fill="#fff" stroke="#0c1322" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    ring = document.createElement('div');
    ring.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #1a5fdb;opacity:0';
    cap = document.createElement('div');
    cap.style.cssText = "position:fixed;left:max(24px,calc(50% - 544px));bottom:26px;z-index:2147483645;pointer-events:none;background:#0c1322;color:#fff;font:600 21px/1.3 'Inter Tight',system-ui,sans-serif;letter-spacing:-.01em;padding:13px 24px;border-radius:10px;box-shadow:0 10px 30px rgba(12,19,34,.25);opacity:0;transition:opacity .35s;white-space:nowrap";
    document.body.append(ring, cur, cap);
    cur.style.transform = `translate(${pos.x}px,${pos.y}px)`;
  }
  window.__demo = {
    move(x, y, ms) { ensure(); pos = { x, y }; cur.style.transition = `transform ${ms}ms cubic-bezier(.45,0,.2,1)`; cur.style.transform = `translate(${x - 2}px,${y - 2}px)`; },
    click() {
      ensure(); ring.style.transition = 'none'; ring.style.transform = `translate(${pos.x}px,${pos.y}px) scale(.4)`; ring.style.opacity = '.9';
      ring.getBoundingClientRect();
      ring.style.transition = 'transform .45s ease-out, opacity .45s ease-out'; ring.style.transform = `translate(${pos.x}px,${pos.y}px) scale(1.4)`; ring.style.opacity = '0';
    },
    caption(text) { ensure(); if (text) cap.textContent = text; cap.style.opacity = text ? '1' : '0'; }
  };
});
const page = await ctx.newPage();
page.on('pageerror', e => serverLog.write('[page] ' + e.message + '\n'));

// ---------- screencast ----------
const frames = []; let cdp, nFrame = 0, recording = false, session = 0;
async function startRec() {
  const sess = ++session;
  cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', async f => {
    const file = String(++nFrame).padStart(6, '0') + '.jpg';
    fs.writeFileSync(path.join(LIVE, file), Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp, session: sess });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  recording = true;
}
async function stopRec() { if (!recording) return; await cdp.send('Page.stopScreencast'); await cdp.detach(); recording = false; }

const demo = (fn, ...a) => page.evaluate(([fn, a]) => window.__demo[fn](...a), [fn, a]);
async function pointAt(target, ms = 650, firstLine = false) {
  // Receipts redraws its table every few seconds, so a row can be detached for a moment: try again.
  let b = null;
  for (let i = 0; i < 20 && !b; i++) {
    b = await (typeof target === 'string' ? page.locator(target).first() : target).boundingBox({ timeout: 2000 }).catch(() => null);
    if (!b) await sleep(150);
  }
  if (!b) throw new Error('Nothing to point at: ' + target);
  const x = Math.round(b.x + Math.min(b.width / 2, 120)), y = Math.round(firstLine ? b.y + 12 : b.y + b.height / 2);
  await demo('move', x, y, ms); await sleep(ms + 60);
  return { x, y };
}
async function clickAt(target, ms) { const p = await pointAt(target, ms); await demo('click'); await page.mouse.click(p.x, p.y); return p; }
const smoothScroll = (y, ms = 900) => page.evaluate(([y, ms]) => new Promise(done => {
  const from = scrollY, t0 = performance.now(), ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  (function step(now) { const k = Math.min(1, (now - t0) / ms); scrollTo(0, from + (y - from) * ease(k)); k < 1 ? requestAnimationFrame(step) : done(); })(t0);
}), [y, ms]);

try {
  // The person's spending rules, set from CardBuddy's own page (the server only takes rule changes from its pages).
  await page.goto(BASE + '/approvals');
  const policy = await page.evaluate(() => fetch('/api/policy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ perPurchase: 100, monthlyBudget: 2500, approveCategories: ['travel'] }) }).then(r => r.json()));
  console.log('policy', JSON.stringify(policy));

  // ---------- 1. Wallet: add three cards through PayPal's card fields ----------
  await page.goto(BASE + '/');
  await page.waitForSelector('#cardForm:not(.pp-wait)', { timeout: 45000 });
  await sleep(800);
  await startRec(); await sleep(400);
  mark('walletReady');
  await demo('caption', 'You add your cards in PayPal’s own card fields');
  await sleep(1500);
  await smoothScroll(190, 900); await sleep(400);
  const field = sel => page.locator(sel);
  // Real key events into PayPal's iframe; then check what the field holds (its formatter can drop a fast keystroke)
  // and type it again if it differs.
  async function typeInto(sel, text, delay, ms) {
    const input = page.frameLocator(sel + ' iframe.zoid-visible').locator('input');
    await clickAt(field(sel), ms); await sleep(250);
    for (let attempt = 0; ; attempt++) {
      await page.keyboard.type(text, { delay: delay * (attempt + 1) });
      const got = (await input.inputValue()).replace(/[^0-9A-Za-z ]/g, '').replace(/ /g, sel === '#name' ? ' ' : '');
      if (got === text.replace(/[^0-9A-Za-z ]/g, '')) return;
      if (attempt > 2) throw new Error('Could not type into ' + sel);
      console.log('retyping', sel);
      await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await sleep(300);
    }
  }
  for (const [i, c] of CARDS.entries()) {
    mark(`c${i + 1}Start`);
    if (i === 1) await demo('caption', 'Two more cards (sped up)');
    await clickAt('#which', i ? 450 : 650); await sleep(250);
    await page.selectOption('#which', c.cardId); await sleep(i ? 300 : 600);
    await typeInto('#name', NAME, 45, 450);
    await typeInto('#number', c.number, 60, 400);
    await typeInto('#expiry', EXPIRY, 110, 400);
    await typeInto('#cvv', CVV, 90, 400);
    if (c.makeDefault) { await sleep(300); await clickAt('#makeDefault', 500); }
    await sleep(i ? 300 : 700);
    await clickAt('#save', 500);
    mark(`c${i + 1}Submit`);
    await page.waitForFunction(() => /^Saved:|couldn|Check the card|isn|refused|403/i.test(document.getElementById('msg').textContent), null, { timeout: 60000 });
    const msg = await page.textContent('#msg');
    if (!/^Saved:/.test(msg)) throw new Error('Card did not save: ' + msg);
    await page.waitForFunction(n => document.getElementById('cardCount').textContent.startsWith(String(n)), i + 1, { timeout: 30000 });
    await sleep(900);
    mark(`c${i + 1}Saved`);
  }
  const wallet = (await page.evaluate(() => fetch('/api/wallet').then(r => r.json()))).map(({ card, brand, last4, isDefault }) => ({ card, brand, last4, isDefault }));
  await demo('caption', 'CardBuddy ranks your cards in every category');
  await pointAt('#cardsH', 700); await sleep(1200);
  mark('tableStart');
  const top = await page.evaluate(() => document.getElementById('routesH').getBoundingClientRect().top + scrollY - 30);
  await smoothScroll(top, 1400); await sleep(300);
  await pointAt('#routes tr:nth-child(1) td:nth-child(2)', 700); await sleep(900);
  await pointAt('#routes tr:nth-child(2) td:nth-child(2)', 600); await sleep(1400);
  await demo('caption', ''); await sleep(1800);
  mark('tableEnd');
  const routes = await page.evaluate(() => [...document.querySelectorAll('#routes tr')].map(tr => [...tr.cells].map(td => td.innerText.trim())));
  await stopRec();

  // ---------- 2. The agent shops, through CardBuddy's MCP tools ----------
  mark('agentStart');
  const wal = await tool('get_wallet', {});
  const rules = await tool('spending_rules', {});
  const first = r => { if (!r.results || !r.results.length) throw new Error('search_store found nothing'); return r.results[0]; };
  const findG = first(await tool('search_store', BUYS.groceries));
  const payG = await tool('checkout', { items: [{ id: findG.id }] });
  const findD = first(await tool('search_store', BUYS.dinner));
  const payD = await tool('checkout', { items: [{ id: findD.id }] });
  const findT = first(await tool('search_store', BUYS.tv));
  const payT = await tool('checkout', { items: [{ id: findT.id }] });
  if (payT.status !== 'needs_approval') throw new Error('The TV was not held: ' + JSON.stringify(payT));
  mark('agentEnd');

  // ---------- 3. Approvals: the person approves the held TV ----------
  await page.goto(BASE + '/approvals');
  await page.waitForSelector('[data-approve]');
  await sleep(500);
  await startRec(); await sleep(300);
  mark('approvalsStart');
  await demo('caption', 'Over your $100 limit: held for you');
  await pointAt('.why li', 900); await sleep(2600);
  await pointAt('.held-foot small', 700); await sleep(1800);
  await demo('caption', 'You approve it. Then CardBuddy pays with the best card');
  await sleep(700);
  await clickAt('[data-approve]', 700);
  mark('approveClick');
  await page.waitForSelector('.empty-state', { timeout: 60000 });
  await sleep(1800);
  mark('approvalsEnd');
  await stopRec();
  const status = await tool('purchase_status', { pendingId: payT.pendingId });
  const list = await tool('list_receipts', { limit: 10 });

  // ---------- 4. Receipts ----------
  await page.goto(BASE + '/receipts');
  await page.waitForFunction(() => document.querySelectorAll('#rows tr').length >= 3 && !document.querySelector('#rows .skel'));
  await sleep(600);
  await startRec(); await sleep(300);
  mark('receiptsStart');
  await demo('caption', 'Every purchase: the card used, vs your default, and its PayPal order');
  await pointAt('#extra', 900); await sleep(2000);
  await smoothScroll(140, 900); await sleep(200);
  await pointAt('#rows tr:nth-child(3) td:nth-child(3)', 800, true); await sleep(1800);
  await pointAt('#rows tr:nth-child(2) td:nth-child(3)', 600, true); await sleep(1800);
  await pointAt('#rows tr:nth-child(1) td:nth-child(3)', 600, true); await sleep(2400);
  mark('receiptsEnd');
  await stopRec();

  const receiptsPage = await page.evaluate(() => fetch('/api/receipts').then(r => r.json()));
  fs.writeFileSync(path.join(LIVE, 'frames.json'), JSON.stringify(frames));
  fs.writeFileSync(path.join(BUILD, 'run.json'), JSON.stringify({
    recordedAt: new Date().toISOString(), port: PORT, policy, wallet, routes, marks,
    buys: BUYS, mcp: calls, results: { wal, rules, findG, payG, findD, payD, findT, payT, status, list }, receipts: receiptsPage
  }, null, 2));
  console.log('frames', frames.length, '→ build/run.json written');
} finally {
  await cleanup();
}
