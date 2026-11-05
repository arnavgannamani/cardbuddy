// Approvals: purchases the policy held, with Approve and Decline, and the policy itself.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function api(path, body) {
    return fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }); });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(x) { return '$' + Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  var labels = {}, last = null;

  function show() {
    return api('/api/pending').then(function (list) {
      $('heldCount').textContent = list.length ? list.length + ' waiting' : '';
      var html = list.length ? list.map(function (p) {
        var what = p.purchase.description || p.purchase.merchant || p.purchase.site || 'Purchase';
        var where = [p.purchase.site || p.purchase.merchant, labels[p.purchase.category]].filter(Boolean).join(' · ');
        var when = new Date(p.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        return '<div class="held"><div class="held-main"><b class="amount">' + money(p.purchase.amount) + '</b><div><b>' + esc(what) + '</b><small>' + esc(where ? where + ' · ' + when : when) + '</small></div></div>' +
          '<ul class="why">' + p.reasons.map(function (r) { return '<li>' + esc(cap(r)) + '</li>'; }).join('') + '</ul>' +
          '<div class="held-foot"><small>' + (p.card ? 'If approved: <b>' + esc(p.card) + '</b>, ' + p.percentBack + '% back (' + money(p.purchase.amount * p.percentBack / 100) + ')' : 'No card in your wallet can pay this. Add one on the Wallet page first.') + '</small>' +
          '<span class="acts"><button class="ghost" data-decline="' + esc(p.id) + '">Decline</button><button data-approve="' + esc(p.id) + '">Approve and pay</button></span></div></div>';
      }).join('') : '<div class="empty-state"><b>Nothing waiting</b><p>When your agent tries a purchase over your limits, or in a category you want to see first, it stops here instead of being charged.</p></div>';
      // Only redrawn when something changed, so a check never resets a button mid-click.
      if (html !== last) { $('list').innerHTML = html; last = html; }
      if (window.cardbuddyRefreshCount) window.cardbuddyRefreshCount();
      if (window.cardbuddyReady) window.cardbuddyReady();
    }).catch(function (e) { $('listMsg').textContent = e.message; });
  }

  // This month's spend against the budget: the server's sum, the same one the rules check.
  function showMonth() {
    return api('/api/policy').then(function (policy) {
      var spent = policy.spentThisMonth;
      var share = Math.min(1, spent / policy.monthlyBudget);
      $('spent').textContent = money(spent) + ' of ' + money(policy.monthlyBudget);
      $('meter').style.width = (share * 100).toFixed(1) + '%';
      $('left').textContent = spent >= policy.monthlyBudget ? 'Budget used. Every purchase waits for you until next month.' : money(policy.monthlyBudget - spent) + ' left before purchases wait for you.';
      return policy;
    });
  }

  // A purchase the agent holds while this page is open shows up by itself, and so does the month's spend.
  // ponytail: a check every 3 seconds while the tab is visible; a push from the server if it ever matters.
  setInterval(function () { if (!document.hidden) { show(); showMonth().catch(function () {}); } }, 3000);

  $('list').addEventListener('click', function (e) {
    var a = e.target.getAttribute('data-approve'), d = e.target.getAttribute('data-decline');
    if (!a && !d) return;
    e.target.disabled = true;
    if (a) e.target.textContent = 'Paying…';
    (a ? api('/api/approve', { id: a }) : api('/api/decline', { id: d }))
      .then(function (r) {
        $('listMsg').textContent = !a || r.status === 'paid' ? '' : r.status === 'unknown'
          ? 'PayPal didn\'t answer in time, so this may or may not have been charged. Check PayPal before trying again.'
          : 'Not paid: every card was declined (' + r.attempts.map(function (t) { return t.card; }).join(', ') + ').';
        show(); showMonth();
      })
      .catch(function (err) { $('listMsg').textContent = err.message; show(); });
  });

  api('/api/config').then(function (cfg) {
    labels = cfg.labels || {};
    return showMonth().then(function (p) {
      $('per').value = p.perPurchase; $('month').value = p.monthlyBudget;
      $('cats').innerHTML = (cfg.categories || []).map(function (c) {
        return '<label class="check"><input type="checkbox" value="' + esc(c) + '"' + (p.approveCategories.indexOf(c) >= 0 ? ' checked' : '') + '> ' + esc(labels[c] || c) + '</label>';
      }).join('');
      return show();
    });
  }).catch(function (e) { $('msg').textContent = e.message; });

  $('savePolicy').onclick = function () {
    var chosen = [].map.call(document.querySelectorAll('#cats input:checked'), function (i) { return i.value; });
    $('msg').className = 'msg';
    api('/api/policy', { perPurchase: Number($('per').value), monthlyBudget: Number($('month').value), approveCategories: chosen })
      .then(function () { $('msg').textContent = 'Saved. Your agent follows these from its next purchase.'; return showMonth(); })
      .catch(function (e) { $('msg').className = 'msg err'; $('msg').textContent = e.message; });
  };
})();
