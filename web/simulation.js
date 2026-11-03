// Shows sim/results.json (copied to web/simulation.json by `node sim/simulate.mjs`): the same year of agent purchases
// paid with the default card versus AgentPay's pick, and what the spending rules did with the agent's mistakes.
(function () {
  'use strict';
  const $ = x => '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const el = (tag, props, ...kids) => { const e = document.createElement(tag); Object.assign(e, props || {}); kids.forEach(k => e.append(k)); return e; };

  function agent(title, line, earned, rate, extra, win) {
    return el('div', { className: 'panel agent' + (win ? ' win' : '') },
      el('h2', { textContent: title }), el('p', { className: 'note', textContent: line, style: 'margin:0 0 10px' }),
      el('div', { className: 'big', textContent: $(earned) }), el('div', { className: 'muted', textContent: rate + '% back on the year' }),
      el('p', { textContent: extra, style: 'margin:10px 0 0;font-weight:600' }));
  }

  function render(r) {
    const h = r.headline, sr = r.spendingRules, def = r.assumptions.wallet.find(w => w.isDefault).card;
    document.getElementById('sub').textContent = `${h.purchases} purchases, ${$(h.spend)}, made by an AI shopping agent with the same three cards: ` +
      r.assumptions.wallet.map(w => w.card).join(', ') + `. Seed ${r.seed}, reproducible with node sim/simulate.mjs.`;

    document.getElementById('agents').append(
      agent('Without AgentPay', `Every purchase on the default card (${def}). No spending rules.`, h.without, h.effWithout,
        `${$(sr.wentOutWithoutHumanCheck.withoutAgentPay)} of mistakes went through`, false),
      agent('With AgentPay', 'The best card per purchase, and the spending rules.', h.with, h.effWith,
        `+${$(h.gap)} (+${h.gapPctOfWithout}%); ${$(sr.wentOutWithoutHumanCheck.withAgentPay)} of mistakes went through`, true));

    const max = Math.max(...r.byCategory.map(c => c.with));
    const bars = document.getElementById('bars');
    for (const c of [...r.byCategory].sort((a, b) => b.with - a.with)) {
      const w = x => (x / max * 100).toFixed(1) + '%';
      bars.append(el('div', { className: 'bar-row' },
        el('div', { className: 'lab' }, el('span', { textContent: `${c.label} (${$(c.spend)})` }),
          el('span', { className: 'muted', textContent: `${$(c.without)} → ${$(c.with)}` + (c.gap > 0 ? ` (+${$(c.gap)})` : ', default is already best') })),
        el('div', { className: 'bar without', style: 'width:' + w(c.without), title: 'Default card ' + $(c.without) }),
        el('div', { className: 'bar with', style: 'width:' + w(c.with), title: c.bestCards.join(', ') + ' ' + $(c.with) })));
    }

    const p = sr.policy;
    document.getElementById('policy').textContent = `Policy: $${p.perPurchase} per purchase, $${p.monthlyBudget.toLocaleString('en-US')} a month, ` +
      `approval for ${p.approveCategories.join(', ')}. Without AgentPay all three go through.`;
    const tb = document.getElementById('mistakes');
    for (const m of sr.mistakes) {
      const held = m.withAgentPay === 'held for approval';
      tb.append(el('tr', {},
        el('td', {}, el('div', { textContent: m.label }), el('small', { className: 'muted', textContent: `${m.site}, ${m.date}` + (m.reasons.length ? '. ' + m.reasons.join('; ') : '') })),
        el('td', { className: 'r', textContent: $(m.amount) }),
        el('td', {}, el('span', { className: 'bad', textContent: 'Went through' })),
        el('td', {}, el('span', { className: held ? 'ok' : 'bad', textContent: held ? 'Held for approval' : 'Went through' }))));
    }
    const lh = sr.legitimatePurchasesHeld;
    document.getElementById('dupnote').textContent = 'The duplicate order is under the per-purchase limit, and the current rules don\'t look for duplicates, so it goes through. ' +
      'Suggested rule: hold a purchase with the same merchant and amount as one in the last 24 hours (in this year it would catch the duplicate and hold nothing else). ' +
      `The $${p.perPurchase} limit also holds ${lh.count} of ${lh.of} legitimate purchases for a tap.`;
    document.getElementById('foot').textContent = `Amex Gold points valued at 1.5 cents (at 1.0 cent the gap is ${$(r.variants.goldAtOneCent.gap)}). ` +
      `With a typical 1% default card the gap is ${$(r.variants.oneCentDefault.gap)}. Card rail only; paying through PayPal on a PayPal Cashback Mastercard would add ${$(r.variants.paypalRail.extraOverBestCard)}. Details: docs/SIMULATION.md.`;
  }

  fetch('simulation.json').then(res => { if (!res.ok) throw new Error(res.status); return res.json(); }).then(render).catch(() => {
    document.getElementById('sub').textContent = 'Couldn\'t load simulation.json. Run node sim/simulate.mjs, then serve the web folder (the page needs http, not file://).';
  });
})();
