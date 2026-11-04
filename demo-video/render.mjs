// Step 2 of the CardBuddy demo video: builds the MP4 from what record.mjs saved.
//   node render.mjs            → cardbuddy-demo.mp4 (1920x1080, 30 fps, no audio)
//   node render.mjs --serve    → serves chat.html at http://localhost:4410/chat.html to watch the thread play
// The agent's side of the chat is written here from build/run.json: the card, percent back, rewards, the default card's
// rewards, the held reason and the PayPal order ids are all read from the real MCP tool results, never typed in.
// Frames: the CardBuddy pages come from record.mjs's screencast (build/live), re-timed to a steady 30 fps (some
// stretches sped up, and the captions say so); the chat and title cards are rendered here frame by frame
// (chat.html's render(ms)) in headless Chrome. ffmpeg encodes the lot to H.264.
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), BUILD = path.join(HERE, 'build'), FONTS = path.join(HERE, '..', 'web', 'fonts');
const FPS = 30, OUT = path.join(HERE, 'cardbuddy-demo.mp4');
const run = JSON.parse(fs.readFileSync(path.join(BUILD, 'run.json'), 'utf8'));
const R = run.results, M = run.marks;

// ---------- the chat, from the real results ----------
const usd = x => '$' + Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
// What was bought: the item search_store found and the shop's total from checkout (tax and delivery included).
const B = {
  groceries: { item: R.findG.name, store: R.payG.cart.store, total: R.payG.cart.total },
  dinner: { item: R.findD.name, store: R.payD.cart.store, total: R.payD.cart.total },
  tv: { item: R.findT.name, store: R.payT.cart.store, total: R.payT.cart.total }
};
const extras = c => [c.tax ? 'tax' : '', c.delivery ? 'delivery' : ''].filter(Boolean).join(' and ');
for (const [k, r] of [['groceries', R.payG], ['dinner', R.payD]]) if (r.status !== 'paid' || !r.paypalOrderId) throw new Error(k + ' was not paid: ' + JSON.stringify(r));
if (R.payT.status !== 'needs_approval') throw new Error('The TV was not held.');
if (R.status.status !== 'approved_and_paid') throw new Error('The TV was not approved and paid: ' + R.status.status);
const TVR = R.status.receipt;
const extra = r => Math.round((r.earned - r.defaultEarned) * 100) / 100;
const paidLine = (r, lead) => `${lead} on your <b>${esc(r.card)}</b>: ${r.percentBack}% back on ${esc(r.why.toLowerCase())}, so ${usd(r.earned)} in rewards. Your ${esc(r.defaultCard)} would have earned ${usd(r.defaultEarned)}` +
  (extra(r) > 0 ? `, so that’s <em>+${usd(extra(r))}</em>.` : '.');
// receipts as MCP gives them don't carry "why"; take it from the server's receipt list
const full = id => run.receipts.receipts.find(x => x.id === id);
const G = { ...R.payG, why: full(R.payG.id).why }, Dn = { ...R.payD, why: full(R.payD.id).why }, T = { ...TVR, why: full(TVR.id).why };

const thread = [], composer = [], heads = [], cards = [];
let t = 0;
const CPS = 30; // the person's typing speed, characters a second
// oldText: the message the first cut of this video typed there (with a price). The time it took to type is kept, the
// rest spent as a longer pause before typing, so every scene starts and ends where it did.
function say(text, pauseBefore = 300, oldText = text) {
  t += pauseBefore + Math.max(0, Math.round((oldText.length - text.length) / CPS * 1000));
  const typedAt = t + Math.round(text.length / CPS * 1000), sendAt = typedAt + 350;
  composer.push({ t, typedAt, sendAt, text });
  thread.push({ kind: 'you', t: sendAt, html: esc(text) });
  t = sendAt;
}
const captions = [];
function tool(name, running, done, ms, opts = {}) { t += 450; thread.push({ kind: 'tool', tool: name, running, done, t, doneAt: t + ms, ...opts }); t += ms; }
function reply(html, think = 900) { t += 250; thread.push({ kind: 'typing', t, until: t + think }); t += think; thread.push({ kind: 'agent', t, html }); }
const head = (step, headline, sub) => heads.push({ t, step, headline, sub });
const order = id => `PayPal order <span>${esc(id)}</span>`;
function card(r, b, extraOpts = {}) {
  const gain = extra(r);
  return { t, html: `<div class="what"><span>${esc(b.item)} · ${esc(b.store)}</span><span>${usd(r.amount)}</span></div>
    <div class="card">${esc(r.card)}</div><div class="why">${r.percentBack}% back · ${esc(r.why.toLowerCase())}</div>
    <div class="gain">${gain > 0 ? `<b>+${usd(gain)}</b><small>${usd(r.earned)} vs ${usd(r.defaultEarned)} on ${esc(r.defaultCard)}</small>` : `<b class="flat">${usd(r.earned)}</b><small>same as ${esc(r.defaultCard)}, your default</small>`}</div>
    <div class="foot">${order(r.paypalOrderId)}</div>`, ...extraOpts };
}
// Real tool durations (ms) as they ran, kept within a readable range.
const ms = name => { const c = run.mcp.filter(x => x.name === name); return c.length ? c : []; };
const found = (f, b) => `${esc(f.name)}, ${usd(f.price)} at ${esc(f.store)}`;
const dur = (name, i, lo = 700, hi = 1600) => Math.max(lo, Math.min(hi, (ms(name)[i] || {}).ms || lo));

// Scene 1: groceries, then dinner
head('<i>2</i> · Text your agent', 'Your agent shops. CardBuddy picks the card.', 'The agent pays through CardBuddy’s tools: the best card for the purchase, your rules, then PayPal.');
t += 400;
say('Can you order my weekly groceries?', 300, "Can you order my weekly groceries from wholefoodsmarket.com? It's $86.40");
tool('search_store', 'Searching the store…', found(R.findG), dur('search_store', 0));
captions.push({ t, until: null, text: 'Greenleaf Market, Night Owl Kitchen and Voltline Electronics are demo stores standing in for PayPal merchants.' });
tool('checkout', 'Checking out through PayPal…', `Paid through PayPal · ${esc(G.paypalOrderId)}`, dur('checkout', 0, 1100, 2400));
reply(paidLine(G, `Done. Your ${esc(B.groceries.item.toLowerCase())} from ${esc(B.groceries.store)} (${usd(G.amount)}) is paid`));
head('<i>2</i> · Text your agent', 'CardBuddy picks the card that earns the most', 'Every purchase is checked against each card in your wallet.');
cards.push(card(G, B.groceries));
t += 4200;
say('and pad thai for dinner tonight', 200, 'and dinner from doordash.com tonight, $38');
tool('search_store', 'Searching the store…', found(R.findD), dur('search_store', 1));
tool('checkout', 'Checking out through PayPal…', `Paid through PayPal · ${esc(Dn.paypalOrderId)}`, dur('checkout', 1, 1100, 2400));
reply(paidLine(Dn, `Ordered. ${esc(B.dinner.item)} from ${esc(B.dinner.store)}, ${usd(Dn.amount)}${extras(R.payD.cart) ? ' with ' + extras(R.payD.cart) : ''}, went`));
cards.push(card(Dn, B.dinner));
const dinnerDone = t;
t += 4800;
const cut1 = t;
captions[0].until = dinnerDone; // until dinner, from the second shop, is paid (gone before its card fades in)

// Scene 2: the TV is held
t += 200;
say('also get me that 65-inch TV', 300, 'also get me that 65-inch TV from bestbuy.com, $1,249');
const tvSearch = dur('search_store', 2, 600, 900); // a tool line the first cut didn't have here: taken off the pause below
tool('search_store', 'Searching the store…', found(R.findT), tvSearch);
tool('checkout', 'Checking out through PayPal…', 'CardBuddy held it for your approval', dur('checkout', 2, 900, 1400), { held: true });
const reasons = R.payT.reasons.map(cap);
reply(`I haven’t bought the TV from ${esc(B.tv.store)} yet. ${extras(R.payT.cart) ? 'With ' + extras(R.payT.cart) + ', ' + esc(R.payT.reasons.join('; ')) : esc(reasons.join('; '))}. CardBuddy is holding it on your Approvals page, and nothing has been charged. If you approve, it goes on your <b>${esc(R.payT.cardIfApproved)}</b>.`, 900);
head('<i>3</i> · Your rules', `Over your ${usd(run.policy.perPurchase).replace('.00', '')} limit:<br>held for you`, 'Your agent can’t skip your rules. Anything outside them waits for you.');
const heldCard = { t, held: true, html: `<div class="what"><span>${esc(B.tv.item)} · ${esc(B.tv.store)}</span><span>${usd(B.tv.total)}</span></div>
  <div class="card">Waiting for your approval<span class="pill">Held</span></div><div class="why">If approved: ${esc(R.payT.cardIfApproved)}</div>
  ${reasons.map(r => `<div class="reason">${esc(r)}</div>`).join('')}` };
cards.push(heldCard);
t += 5200 - 450 - tvSearch;
const cut2 = t;

// Scene 3: after the person approves on the Approvals page
t += 200;
head('<i>4</i> · You approve', 'Approved, then paid on the best card', 'CardBuddy checks every card again when you approve.');
heldCard.until = t + 200;
cards.push({ ...card(T, B.tv), t: t + 200, replaces: true });
say('Approved it. Did the TV go through?', 500);
tool('purchase_status', 'Checking on the TV…', 'Checked CardBuddy: approved and paid', dur('purchase_status', 0, 700, 1200));
const same = T.card === T.defaultCard;
reply(`Yes, it’s paid: ${usd(T.amount)} on your <b>${esc(T.card)}</b>, ${T.percentBack}% back (${usd(T.earned)}).` +
  (same ? ` That’s already your best card for it, so it stays on your default.` : ` That’s ${usd(T.earned - T.defaultEarned)} more than your ${esc(T.defaultCard)}.`) +
  ` <span class="id">PayPal order ${esc(T.paypalOrderId)}</span>`, 900);
t += 5200;
const cut3 = t;

const tot = run.receipts.totals;
const CHAT = {
  thread, composer, heads, cards, captions, introMs: 4000, chatMs: cut3, outroMs: 4500,
  outroFine: `In this recording: ${tot.purchases} purchases paid through the PayPal sandbox, ${usd(tot.earned)} in rewards, +${usd(tot.extra)} more than the default card.`
};
fs.writeFileSync(path.join(BUILD, 'chat-data.js'), '// Written by render.mjs from build/run.json.\nwindow.CHAT = ' + JSON.stringify(CHAT, null, 1) + ';\n');

// ---------- a small static server for chat.html and the fonts ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = p.startsWith('/fonts/') ? path.join(FONTS, path.basename(p)) : p === '/chat.html' ? path.join(HERE, 'chat.html') : p === '/build/chat-data.js' ? path.join(BUILD, 'chat-data.js') : null;
  if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
});
const SPORT = 4410;
await new Promise(r => srv.listen(SPORT, '127.0.0.1', r));
if (process.argv.includes('--serve')) { console.log(`Open http://localhost:${SPORT}/chat.html (Ctrl+C to stop)`); await new Promise(() => {}); }

// ---------- render the chat and title frames ----------
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1920 / 1440 })).newPage();
await page.goto(`http://localhost:${SPORT}/chat.html?driven`);
await page.evaluate(() => document.fonts.ready);
const CHATDIR = path.join(BUILD, 'chat');
fs.rmSync(CHATDIR, { recursive: true, force: true }); fs.mkdirSync(CHATDIR);
let nChat = 0;
if (process.argv.includes('--stills')) {
  // A few frames to check the look: build/stills/*.png
  const dir = path.join(BUILD, 'stills'); fs.mkdirSync(dir, { recursive: true });
  for (const [scene, at] of [['intro', 3000], ['chat', cut1 - 100], ['chat', cut2 - 100], ['chat', cut3 - 100], ['outro', 4000], ['chat', thread[2].t + 300]]) {
    await page.evaluate(([ms, scene]) => window.render(ms, scene), [at, scene]);
    await page.screenshot({ path: path.join(dir, scene + '-' + Math.round(at) + '.png') });
  }
  await browser.close(); srv.close(); console.log('stills in', dir); process.exit(0);
}
async function renderRange(scene, a, b) {
  const files = [];
  for (let ms = a; ms < b; ms += 1000 / FPS) {
    await page.evaluate(([ms, scene]) => window.render(ms, scene), [ms, scene]);
    const file = path.join(CHATDIR, String(++nChat).padStart(6, '0') + '.jpg');
    await page.screenshot({ path: file, type: 'jpeg', quality: 93 });
    files.push(file);
  }
  console.log(`rendered ${scene} ${a}-${Math.round(b)} ms: ${files.length} frames`);
  return files;
}

// ---------- re-time the screencast ----------
const live = JSON.parse(fs.readFileSync(path.join(BUILD, 'live', 'frames.json'), 'utf8'));
// Older recordings have no session numbers: split them by the marks.
for (const f of live) if (f.session == null) f.session = f.t < M.agentStart ? 1 : f.t < M.approvalsEnd + 0.5 ? 2 : 3;
// pieces: [from, to, speed] in screencast seconds, all within one recording session
function liveFrames(session, pieces) {
  const own = live.filter(f => f.session === session);
  const out = [];
  for (const [a, b, speed] of pieces) {
    for (let s = a; s < b; s += speed / FPS) {
      let f = own[0];
      for (const x of own) { if (x.t <= s) f = x; else break; }
      out.push(path.join(BUILD, 'live', f.file));
    }
  }
  return out;
}

const shots = [];
const add = (name, files) => { shots.push({ name, files }); };
add('Title', await renderRange('intro', 0, CHAT.introMs));
add('Wallet: adding the Citi Double Cash in PayPal’s card fields', liveFrames(1, [[M.walletReady, M.c1Submit, 1], [M.c1Submit, M.c1Saved, 1.5]]));
add('Wallet: Amex Gold and Amex Blue Cash Preferred (2.5x)', liveFrames(1, [[M.c2Start, M.c3Saved, 2.5]]));
add('Wallet: Where each card wins', liveFrames(1, [[M.c3Saved, M.tableEnd, 1]]));
add('Chat: groceries and dinner paid', await renderRange('chat', 0, cut1));
add('Chat: TV held for approval', await renderRange('chat', cut1, cut2));
add('Approvals: the held TV, approved', liveFrames(2, [[M.approvalsStart, M.approveClick, 1], [M.approveClick, M.approvalsEnd, 1.5]]));
add('Chat: agent confirms the TV was paid', await renderRange('chat', cut2, cut3));
add('Receipts', liveFrames(3, [[M.receiptsStart, M.receiptsEnd, 1]]));
add('End card', await renderRange('outro', 0, CHAT.outroMs));
await browser.close(); srv.close();

// ---------- encode ----------
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const enc = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-vf', 'scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-r', String(FPS), '-movflags', '+faststart', '-an', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
let n = 0; const list = [];
for (const s of shots) {
  list.push({ at: +(n / FPS).toFixed(1), shot: s.name, seconds: +(s.files.length / FPS).toFixed(1) });
  for (const f of s.files) { if (!enc.stdin.write(fs.readFileSync(f))) await new Promise(r => enc.stdin.once('drain', r)); n++; }
}
enc.stdin.end();
await new Promise((res, rej) => enc.on('close', c => c ? rej(new Error('ffmpeg failed ' + c)) : res()));
fs.writeFileSync(path.join(BUILD, 'shots.json'), JSON.stringify(list, null, 2));
console.table(list);
console.log(`${OUT}: ${(n / FPS).toFixed(1)} s, ${n} frames`);
