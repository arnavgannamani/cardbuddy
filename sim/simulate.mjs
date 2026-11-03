// A year of purchases made by an AI shopping agent, paid two ways:
//   without AgentPay: every purchase on the wallet's default card, no spending rules;
//   with AgentPay:    the best card per purchase (src/choose.mjs) and the spending policy (src/policy.mjs).
// No PayPal calls, no server, no data/ files: card choice and policy only. Deterministic (fixed seed).
// Run: node sim/simulate.mjs   -> writes sim/results.json and web/simulation.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { choose, E } from '../src/choose.mjs';
import { check } from '../src/policy.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = 20261112; // the hackathon deadline, Nov 12 2026
const YEAR = 2026;

// ---------- seeded random ----------
function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(SEED);
const between = (lo, hi) => Math.round((lo + rnd() * (hi - lo)) * 100) / 100;
const pickOne = xs => xs[Math.floor(rnd() * xs.length)];
const day = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const r2 = x => Math.round(x * 100) / 100;
// Noon UTC so policy.mjs (which buckets months by UTC) and local dates agree.
const at = (m, d) => new Date(Date.UTC(YEAR, m, d, 12, 0, 0));

// ---------- the year of purchases ----------
// Counts and ranges are per month unless stated. One person, all bought by the agent online.
const PLAN = [
  { what: 'Food delivery', sites: ['doordash.com', 'ubereats.com'], perMonth: 8, lo: 25, hi: 55 },
  { what: 'Groceries', sites: ['wholefoodsmarket.com', 'instacart.com'], perMonth: 4, lo: 90, hi: 160, weekly: true },
  { what: 'Amazon', sites: ['amazon.com'], perMonth: 4, lo: 20, hi: 90 },
  { what: 'Rides', sites: ['uber.com', 'lyft.com'], perMonth: 6, lo: 12, hi: 35 },
  { what: 'Online shopping', sites: ['etsy.com', 'target.com', 'bestbuy.com'], perMonth: 3, lo: 25, hi: 220 }
];
const SUBSCRIPTIONS = [ // monthly, fixed price (typical U.S. list prices for a standard / individual plan)
  { site: 'netflix.com', amount: 17.99, day: 5 },
  { site: 'spotify.com', amount: 11.99, day: 12 }
];
const TRIPS = [ // [month index, site, lo, hi]
  [2, 'delta.com', 250, 600], [6, 'united.com', 250, 600], [10, 'delta.com', 250, 600],
  [6, 'marriott.com', 200, 700], [11, 'airbnb.com', 200, 700]
];

const purchases = [];
for (let m = 0; m < 12; m++) {
  for (const p of PLAN) {
    for (let i = 0; i < p.perMonth; i++) {
      const d = p.weekly ? Math.min(28, 2 + i * 7 + day(0, 3)) : day(1, 28);
      purchases.push({ date: at(m, d), site: pickOne(p.sites), amount: between(p.lo, p.hi), what: p.what });
    }
  }
  for (const s of SUBSCRIPTIONS) purchases.push({ date: at(m, s.day), site: s.site, amount: s.amount, what: 'Subscription' });
}
for (const [m, site, lo, hi] of TRIPS) purchases.push({ date: at(m, day(1, 28)), site, amount: between(lo, hi), what: /delta|united/.test(site) ? 'Flight' : 'Stay' });
purchases.sort((a, b) => a.date - b.date || a.site.localeCompare(b.site));
purchases.forEach((p, i) => { p.id = 'p' + String(i + 1).padStart(3, '0'); });

// ---------- the three scripted agent mistakes ----------
// (a) the agent re-submits a grocery order it already placed that day. It duplicates a real order from the list:
//     the first grocery order of the year under $100 (a duplicate of a bigger order would be held, but only for its size).
const dupOf = purchases.find(p => p.what === 'Groceries' && p.amount < 100);
const MISTAKES = [
  { key: 'duplicate', label: 'Duplicate grocery order', story: `The agent placed the same ${dupOf.site} order twice on the same day.`,
    date: new Date(dupOf.date.getTime() + 3600e3), site: dupOf.site, amount: dupOf.amount, duplicateOf: dupOf.id },
  { key: 'tv', label: '$1,249 TV instead of a $150 TV mount', story: 'Asked for a "$150 TV mount", the agent ordered a $1,249 TV.',
    date: at(8, 14), site: 'bestbuy.com', amount: 1249 },
  { key: 'flight', label: '$612 flight on the wrong date', story: 'The agent booked a $612 flight for the wrong day.',
    date: at(4, 20), site: 'delta.com', amount: 612 }
];

// ---------- wallets ----------
const W3 = [{ vaultId: 'sim-dc', cardId: 'double-cash', isDefault: true }, { vaultId: 'sim-gold', cardId: 'amex-gold' }, { vaultId: 'sim-bcp', cardId: 'bcp' }];
const W4 = [...W3, { vaultId: 'sim-pp', cardId: 'paypal-cashback-mastercard' }];
const W_NO_DC = [{ vaultId: 'sim-gold', cardId: 'amex-gold' }, { vaultId: 'sim-bcp', cardId: 'bcp' }];
const card = id => E.HOLDABLE.find(c => c.id === id);
// engine/cards.json has no holdable flat-1% card (checked: the lowest flat cards are VentureOne 1.25x and several 1.5%
// cards), so the weaker-default variant uses a stand-in "typical 1% card": 1% cash back on everything, no bonuses.
const ONE_PCT = { cardId: 'sim-flat-1pct', card: 'Typical 1% card (stand-in)', percentBack: 1, rail: 'card', cash: true, cap: null };

// ---------- caps ----------
// choose() scores one purchase as if no cap were used. Over a year we track each card's capped categories and, past
// the cap, rescore that card at the cap's `after` rate (a purchase that crosses the cap is split).
function capTracker() {
  const used = {}; // cardId|cat -> dollars spent at the bonus rate
  function effective(o, cat, amount) {
    const c = card(o.cardId), cp = c && c.caps && c.caps[cat];
    if (!o.cap || !cp) return o.percentBack;
    const k = o.cardId + '|' + cat, left = Math.max(0, cp.limit - (used[k] || 0));
    const inCap = Math.min(amount, left), over = amount - inCap;
    return (inCap * o.percentBack + over * cp.after * c.cpp) / amount;
  }
  function spend(o, cat, amount) { const c = card(o.cardId); if (o.cap && c && c.caps && c.caps[cat]) used[o.cardId + '|' + cat] = (used[o.cardId + '|' + cat] || 0) + amount; }
  return { effective, spend, used };
}
const rank = (a, b) => b.eff - a.eff || (b.rail === 'card') - (a.rail === 'card') || b.cash - a.cash; // choose()'s tie rules

// Optional point re-valuation (sensitivity): scale the percent back of a points card.
function revalue(o, scale) { const s = scale && scale[o.cardId]; return s ? { ...o, percentBack: o.percentBack * s } : o; }

// One wallet over the year. Returns per-purchase rows plus totals.
function runWallet({ wallet, extraDefault = null, scale = null, rails = ['card'] }) {
  const caps = capTracker();
  const rows = purchases.map(p => {
    const c = choose(wallet, { site: p.site, amount: p.amount }, p.date);
    let opts = c.options.map(o => revalue(o, scale));
    if (extraDefault) opts.push({ ...extraDefault });
    opts = opts.map(o => ({ ...o, eff: caps.effective(o, c.category, p.amount) })).sort(rank);
    const onCard = opts.filter(o => o.rail === 'card');
    const best = onCard[0];
    const anyRail = opts.filter(o => rails.includes(o.rail))[0];
    const def = extraDefault ? extraDefault : (() => { const d = onCard.find(o => o.cardId === (wallet.find(w => w.isDefault) || wallet[0]).cardId); return d; })();
    const defPct = extraDefault ? extraDefault.percentBack : caps.effective(def, c.category, p.amount);
    caps.spend(best, c.category, p.amount); // AgentPay's card-rail pick is what gets charged
    return {
      id: p.id, date: p.date.toISOString().slice(0, 10), site: p.site, store: c.store, what: p.what, category: c.category, categoryLabel: c.categoryLabel,
      amount: p.amount, warning: c.warning,
      defaultCard: def.card, defaultPct: r2(defPct), earnedWithout: p.amount * defPct / 100,
      bestCard: best.card, bestPct: r2(best.eff), bestWhy: best.why || null, earnedWith: p.amount * best.eff / 100,
      bestAnyRail: anyRail && anyRail.rail !== 'card' && anyRail.eff > best.eff ? { rail: anyRail.rail, card: anyRail.card, pct: r2(anyRail.eff), earned: p.amount * anyRail.eff / 100 } : null
    };
  });
  const spend = rows.reduce((s, r) => s + r.amount, 0);
  const without = rows.reduce((s, r) => s + r.earnedWithout, 0), withAP = rows.reduce((s, r) => s + r.earnedWith, 0);
  return { rows, capsUsed: caps.used, totals: { purchases: rows.length, spend: r2(spend), without: r2(without), with: r2(withAP), gap: r2(withAP - without), gapPctOfWithout: r2((withAP - without) / without * 100), gapPctOfSpend: r2((withAP - without) / spend * 100), effWithout: r2(without / spend * 100), effWith: r2(withAP / spend * 100) } };
}

function byCategory(rows) {
  const out = {};
  for (const r of rows) {
    const o = out[r.category] || (out[r.category] = { category: r.category, label: r.categoryLabel, purchases: 0, spend: 0, without: 0, with: 0, defaultCards: new Set(), bestCards: new Set() });
    o.purchases++; o.spend += r.amount; o.without += r.earnedWithout; o.with += r.earnedWith; o.defaultCards.add(r.defaultCard); o.bestCards.add(`${r.bestCard} ${r.bestPct}%`);
  }
  return Object.values(out).map(o => ({ ...o, spend: r2(o.spend), without: r2(o.without), with: r2(o.with), gap: r2(o.with - o.without), defaultCards: [...o.defaultCards], bestCards: [...o.bestCards] }))
    .sort((a, b) => b.gap - a.gap);
}

// ---------- headline: 3-card wallet, Double Cash default ----------
const main = runWallet({ wallet: W3 });
const cats = byCategory(main.rows);

// ---------- cap check ----------
const capCheck = [];
for (const id of ['double-cash', 'amex-gold', 'bcp']) {
  const c = card(id);
  for (const [cat, cp] of Object.entries(c.caps || {})) {
    const k = id + '|' + cat, charged = main.capsUsed[k] || 0;
    const catSpend = main.rows.filter(r => r.category === cat).reduce((s, r) => s + r.amount, 0);
    capCheck.push({ card: c.name, category: cat, limit: cp.limit, period: cp.period, after: cp.after, chargedAtBonus: r2(charged), categorySpend: r2(catSpend), exceeded: charged > cp.limit, overBy: r2(Math.max(0, charged - cp.limit)) });
  }
}

// ---------- variants ----------
const weak = runWallet({ wallet: W_NO_DC, extraDefault: ONE_PCT });
const goldAtOneCent = runWallet({ wallet: W3, scale: { 'amex-gold': 1 / card('amex-gold').cpp } });
const four = runWallet({ wallet: W4, rails: ['card', 'paypal', 'venmo'] });
const railRows = four.rows.filter(r => r.bestAnyRail);
const railExtra = railRows.reduce((s, r) => s + r.bestAnyRail.earned - r.earnedWith, 0);
const railByCat = {};
for (const r of railRows) { const o = railByCat[r.category] || (railByCat[r.category] = { category: r.category, purchases: 0, spend: 0, extra: 0, bestCard: r.bestCard, bestPct: r.bestPct, railCard: r.bestAnyRail.card, railPct: r.bestAnyRail.pct }); o.purchases++; o.spend += r.amount; o.extra += r.bestAnyRail.earned - r.earnedWith; }
Object.values(railByCat).forEach(o => { o.spend = r2(o.spend); o.extra = r2(o.extra); });
const threeCardRail = main.rows.filter(r => r.bestAnyRail).length; // should be 0: no PayPal or Venmo card in the 3-card wallet

// ---------- spending rules ----------
const monthly = Array.from({ length: 12 }, (_, m) => r2(purchases.filter(p => p.date.getUTCMonth() === m).reduce((s, p) => s + p.amount, 0)));
const avgMonth = r2(monthly.reduce((a, b) => a + b, 0) / 12);
// Budget: the typical month plus headroom, rounded to a number a person would type. Stated in the write-up.
const MONTHLY_BUDGET = 2500;
const POLICY = { perPurchase: 100, monthlyBudget: MONTHLY_BUDGET, approveCategories: ['travel'] };

function runPolicy(policy, { duplicateRule = false } = {}) {
  const events = [...purchases.map(p => ({ ...p, mistake: null })), ...MISTAKES.map(m => ({ ...m, what: m.label, mistake: m.key }))].sort((a, b) => a.date - b.date);
  const receipts = [], log = [];
  for (const e of events) {
    const c = choose(W3, { site: e.site, amount: e.amount }, e.date);
    const res = check(policy, receipts, { amount: e.amount, category: c.category }, e.date);
    const reasons = [...res.reasons];
    if (duplicateRule) { // suggested rule, NOT in src/policy.mjs: same merchant + same amount within 24 hours
      const dup = receipts.find(r => r.site === e.site && r.amount === e.amount && Math.abs(new Date(r.at) - e.date) < 864e5);
      if (dup) reasons.push(`same merchant and amount as a purchase ${Math.round(Math.abs(e.date - new Date(dup.at)) / 36e5)}h earlier`);
    }
    const held = reasons.length > 0;
    // The person approves every legitimate purchase that was held and declines the agent's mistakes.
    const paid = !held || !e.mistake;
    if (paid) receipts.push({ status: 'paid', at: e.date.toISOString(), amount: e.amount, site: e.site });
    log.push({ date: e.date.toISOString().slice(0, 10), site: e.site, category: c.category, amount: e.amount, mistake: e.mistake, held, reasons });
  }
  const legitHeld = log.filter(l => !l.mistake && l.held);
  const reasonCount = {};
  for (const l of legitHeld) for (const r of l.reasons) { const k = /per-purchase/.test(r) ? 'per-purchase limit' : /budget/.test(r) ? 'monthly budget' : /always need/.test(r) ? 'travel category' : 'duplicate rule'; reasonCount[k] = (reasonCount[k] || 0) + 1; }
  return {
    mistakes: MISTAKES.map(m => { const l = log.find(x => x.mistake === m.key); return { key: m.key, label: m.label, story: m.story, date: l.date, site: m.site, amount: m.amount, category: l.category, withoutAgentPay: 'went through', withAgentPay: l.held ? 'held for approval' : 'went through', reasons: l.reasons }; }),
    legitHeld: legitHeld.length, legitHeldSpend: r2(legitHeld.reduce((s, l) => s + l.amount, 0)), legitHeldByReason: reasonCount,
    legitHeldByCategory: legitHeld.reduce((o, l) => (o[l.category] = (o[l.category] || 0) + 1, o), {})
  };
}
const policyRun = runPolicy(POLICY);
const policyWithDupRule = runPolicy(POLICY, { duplicateRule: true });
const policy200 = runPolicy({ ...POLICY, perPurchase: 200 });
const mistakeTotal = r2(MISTAKES.reduce((s, m) => s + m.amount, 0));
const slipped = policyRun.mistakes.filter(m => m.withAgentPay === 'went through');
const groceryUnder100 = purchases.filter(p => p.what === 'Groceries' && p.amount <= POLICY.perPurchase).length;
const groceryCount = purchases.filter(p => p.what === 'Groceries').length;
const legitSmall = purchases.filter(p => p.amount <= POLICY.perPurchase).length;

// ---------- 2030 illustration ----------
const pct = main.totals.gapPctOfSpend; // percent of spend
const estimate = { gapPctOfSpend: pct, low: 190e9 * pct / 100, high: 385e9 * pct / 100 };

const results = {
  generated: 'node sim/simulate.mjs', seed: SEED, year: YEAR,
  assumptions: {
    wallet: W3.map(w => ({ cardId: w.cardId, card: card(w.cardId).name, isDefault: !!w.isDefault, annualFee: card(w.cardId).fee })),
    pointValues: { 'amex-gold': `Membership Rewards valued at ${card('amex-gold').cpp} cents per point (the engine's value); a 1-cent sensitivity is reported` },
    fees: 'The wallet is the same with and without AgentPay, so annual fees and card credits (e.g. Amex Gold Uber Cash) do not change the gap and are left out.',
    rail: 'Headline uses the card rail only (how AgentPay pays today). PayPal/Venmo rails are reported separately.',
    caps: 'Category caps tracked across the year; past a cap the card earns the cap\'s after rate.',
    mistakesExcludedFromRewards: true,
    policy: POLICY, avgMonthlySpend: avgMonth, monthlySpend: monthly,
    oneCentDefault: 'engine/cards.json has no holdable flat 1% card; the 1% variant uses a stand-in flat 1% card.'
  },
  headline: { label: 'Conservative headline: 3-card wallet, Citi Double Cash (2% everywhere) as the default', ...main.totals },
  byCategory: cats,
  capCheck,
  variants: {
    oneCentDefault: { label: 'Default is a typical 1% card (stand-in; replaces Double Cash in the wallet)', ...weak.totals, byCategory: byCategory(weak.rows) },
    goldAtOneCent: { label: 'Sensitivity: Amex Gold points valued at 1.0 cents, not 1.5', ...goldAtOneCent.totals },
    paypalRail: { label: '4-card wallet: add the PayPal Cashback Mastercard and pay through PayPal where that earns more', cardRailTotals: four.totals, purchasesWherePaypalRailWins: railRows.length, extraOverBestCard: r2(railExtra), byCategory: Object.values(railByCat), threeCardWalletOtherRailWins: threeCardRail }
  },
  spendingRules: {
    policy: POLICY, mistakes: policyRun.mistakes, mistakeTotal,
    wentOutWithoutHumanCheck: { withoutAgentPay: mistakeTotal, withAgentPay: r2(slipped.reduce((s, m) => s + m.amount, 0)) },
    legitimatePurchasesHeld: { count: policyRun.legitHeld, of: purchases.length, spend: policyRun.legitHeldSpend, byReason: policyRun.legitHeldByReason, byCategory: policyRun.legitHeldByCategory },
    groceryOrdersUnderLimit: { count: groceryUnder100, of: groceryCount }, purchasesUnderLimit: { count: legitSmall, of: purchases.length },
    suggestedDuplicateRule: { rule: 'Hold a purchase with the same merchant and the same amount as a paid purchase in the last 24 hours (not in AgentPay yet; simulated here)', mistakes: policyWithDupRule.mistakes.map(m => ({ key: m.key, withAgentPay: m.withAgentPay, reasons: m.reasons })), extraLegitHeld: policyWithDupRule.legitHeld - policyRun.legitHeld },
    perPurchase200: { label: 'Sensitivity: per-purchase limit $200', mistakes: policy200.mistakes.map(m => ({ key: m.key, withAgentPay: m.withAgentPay })), legitHeld: policy200.legitHeld }
  },
  estimate2030: { ...estimate, basis: "Morgan Stanley's $190B-$385B U.S. agentic e-commerce by 2030 x the simulated gap as % of spend. Illustration, not a forecast." },
  purchases: main.rows.map(r => ({ ...r, earnedWithout: r2(r.earnedWithout), earnedWith: r2(r.earnedWith) })),
  mistakes: MISTAKES.map(m => ({ key: m.key, label: m.label, story: m.story, date: m.date.toISOString().slice(0, 10), site: m.site, amount: m.amount, duplicateOf: m.duplicateOf || null }))
};

const json = JSON.stringify(results, null, 2);
fs.writeFileSync(path.join(ROOT, 'sim', 'results.json'), json + '\n');
fs.writeFileSync(path.join(ROOT, 'web', 'simulation.json'), json + '\n');

// ---------- console summary ----------
const $ = x => '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const t = main.totals;
console.log(`Seed ${SEED}. ${t.purchases} purchases, ${$(t.spend)} spend (avg month ${$(avgMonth)}; months ${monthly.map(x => Math.round(x)).join(', ')})`);
console.log(`Headline (Double Cash default): without ${$(t.without)} (${t.effWithout}%), with ${$(t.with)} (${t.effWith}%), gap ${$(t.gap)} (+${t.gapPctOfWithout}%, ${pct.toFixed(2)}% of spend)`);
console.log('By category:');
for (const c of cats) console.log(`  ${c.label.padEnd(26)} ${String(c.purchases).padStart(3)}  ${$(c.spend).padStart(11)}  without ${$(c.without).padStart(9)}  with ${$(c.with).padStart(9)}  gap ${$(c.gap).padStart(8)}  [${c.bestCards.join(' / ')}]`);
console.log('Caps:', capCheck.map(c => `${c.card} ${c.category}: ${$(c.chargedAtBonus)} of ${$(c.limit)}${c.exceeded ? ' EXCEEDED by ' + $(c.overBy) : ''}`).join('; '));
const w = weak.totals; console.log(`1% default: without ${$(w.without)}, with ${$(w.with)}, gap ${$(w.gap)} (+${w.gapPctOfWithout}%, ${w.gapPctOfSpend.toFixed(2)}% of spend)`);
const g = goldAtOneCent.totals; console.log(`Gold at 1.0c: with ${$(g.with)}, gap ${$(g.gap)} (+${g.gapPctOfWithout}%)`);
console.log(`PayPal rail (4 cards): ${railRows.length} purchases, +${$(railExtra)} over best card; 3-card wallet other-rail wins: ${threeCardRail}`, Object.values(railByCat));
console.log('Mistakes:', policyRun.mistakes.map(m => `${m.key} ${$(m.amount)}: ${m.withAgentPay}${m.reasons.length ? ' (' + m.reasons.join('; ') + ')' : ''}`).join(' | '));
console.log(`Legit purchases held: ${policyRun.legitHeld} of ${purchases.length} (${$(policyRun.legitHeldSpend)})`, policyRun.legitHeldByReason, policyRun.legitHeldByCategory);
console.log('With duplicate rule:', policyWithDupRule.mistakes.map(m => `${m.key}: ${m.withAgentPay}`).join(', '), `extra legit held ${policyWithDupRule.legitHeld - policyRun.legitHeld}`);
console.log(`perPurchase 200: legit held ${policy200.legitHeld}`, policy200.mistakes.map(m => `${m.key}: ${m.withAgentPay}`).join(', '));
console.log(`2030: ${pct.toFixed(4)}% x $190B = ${$(estimate.low)}; x $385B = ${$(estimate.high)}`);
console.log('Wrote sim/results.json and web/simulation.json');
