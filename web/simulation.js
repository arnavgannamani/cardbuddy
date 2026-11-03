// Shows sim/results.json (copied to web/simulation.json by `node sim/simulate.mjs`): the same year of agent purchases
// paid with the default card versus AgentPay's pick, and what the spending rules did with the agent's mistakes.
(function () {
  'use strict';
  const $ = x => '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const $0 = x => '$' + Math.round(x).toLocaleString('en-US');
  const id = x => document.getElementById(x);
  const el = (tag, props, ...kids) => { const e = document.createElement(tag); Object.assign(e, props || {}); kids.forEach(k => e.append(k)); return e; };
  const bar = (cls, w, title) => { const i = el('i', { className: cls, title }); i.style.width = w; return i; };

  function render(r) {
    const h = r.headline, sr = r.spendingRules, wallet = r.assumptions.wallet, def = wallet.find(w => w.isDefault).card;
    id('sub').textContent = `${h.purchases} purchases worth ${$0(h.spend)} over ${r.year}, made by one shopping agent holding ${wallet.length} cards: ` +
      wallet.map(w => w.card).join(', ') + `. One run pays with the default card (${def}) every time; the other lets AgentPay choose and applies the spending rules.`;

    id('gap').textContent = '+' + $(h.gap);
    id('gapNote').textContent = `+${Math.round(h.gapPctOfWithout)}% over the default card`;
    id('without').textContent = $(h.without);
    id('withoutNote').textContent = `${h.effWithout.toFixed(2)}% back, all on ${def}`;
    id('with').textContent = $(h.with);
    id('withNote').textContent = `${h.effWith.toFixed(2)}% back, best card each time`;
    id('mist').textContent = $(sr.wentOutWithoutHumanCheck.withAgentPay);
    id('mistNote').textContent = `down from ${$(sr.wentOutWithoutHumanCheck.withoutAgentPay)} without rules`;

    const cats = [...r.byCategory].sort((a, b) => b.gap - a.gap || b.with - a.with);
    const max = Math.max(...cats.map(c => c.with));
    const w = x => (x / max * 100).toFixed(1) + '%';
    id('catRows').replaceChildren(...cats.map(c => {
      const wins = c.gap > 0.005;
      return el('tr', {},
        el('td', {}, el('b', { textContent: c.label }), el('br'), el('small', { textContent: `${c.purchases} purchases` })),
        el('td', { className: 'r', textContent: $0(c.spend) }),
        el('td', {}, wins ? document.createTextNode(c.bestCards.join(', ')) : el('span', { className: 'muted', textContent: 'Default card' })),
        el('td', {}, el('div', { className: 'pair' }, bar('without', w(c.without), 'Default card ' + $(c.without)), bar('with', w(c.with), 'AgentPay ' + $(c.with)))),
        el('td', { className: 'r muted', textContent: $(c.without) }),
        el('td', { className: 'r' }, wins ? el('b', { className: 'extra', textContent: $(c.with) }) : document.createTextNode($(c.with))));
    }));

    const p = sr.policy;
    id('policy').textContent = `The rules: up to $${p.perPurchase} a purchase, $${p.monthlyBudget.toLocaleString('en-US')} a month, and ${p.approveCategories.join(', ')} always asks first. Without AgentPay nothing checks the agent.`;
    id('mistakes').replaceChildren(...sr.mistakes.map(m => {
      const held = m.withAgentPay === 'held for approval';
      return el('tr', {},
        el('td', {}, el('b', { textContent: m.label }), el('br'), el('small', { textContent: `${m.site}, ${new Date(m.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` + (m.reasons.length ? '. Held because ' + m.reasons.join('; ') : '') })),
        el('td', { className: 'r', textContent: $(m.amount) }),
        el('td', {}, el('span', { className: 'pill neg', textContent: 'Paid' })),
        el('td', {}, el('span', { className: held ? 'pill pos' : 'pill neg', textContent: held ? 'Held for you' : 'Paid' })));
    }));
    const lh = sr.legitimatePurchasesHeld;
    id('dupnote').replaceChildren(el('b', { textContent: 'What gets past the rules: ' }),
      `the duplicate order is under the $${p.perPurchase} limit and the rules don't look for repeats yet. A rule that holds the same merchant and amount within 24 hours would catch it and hold nothing else this year. ` +
      `The $${p.perPurchase} limit also asks about ${lh.count} of ${lh.of} ordinary purchases.`);

    const fact = (t, d) => el('div', {}, el('b', { textContent: t }), d);
    id('facts').replaceChildren(
      fact('Same cards both ways', 'Annual fees and card credits are equal in both runs, so they don\'t change the gap. Category caps are tracked across the year.'),
      fact('Points at 1.5 cents', `Amex Gold points at the engine's 1.5 cents. At 1 cent the gap is ${$(r.variants.goldAtOneCent.gap)}; with a 1% default card it's ${$(r.variants.oneCentDefault.gap)}.`),
      fact('Card rail only', `Paying through PayPal on a PayPal Cashback Mastercard would add ${$(r.variants.paypalRail.extraOverBestCard)}. Mistakes are left out of the rewards.`));
    const e = r.estimate2030;
    id('scale').replaceChildren(el('b', { textContent: 'At scale: ' }),
      `if ${e.gapPctOfSpend}% of spend is left on the table, U.S. agent shopping in 2030 ($190B to $385B, Morgan Stanley) misses $${(e.low / 1e9).toFixed(1)}B to $${(e.high / 1e9).toFixed(1)}B in rewards a year. An illustration, not a forecast.`);
  }

  fetch('/simulation.json').then(res => { if (!res.ok) throw new Error(res.status); return res.json(); }).then(render).catch(() => {
    id('sub').textContent = 'Couldn\'t load simulation.json. Run node sim/simulate.mjs, then open this page from the AgentPay server.';
    id('catRows').replaceChildren(el('tr', {}, el('td', { colSpan: 6, className: 'empty', textContent: 'No simulation results yet.' })));
  });
})();
