// Approvals: purchases the policy held, with Approve and Decline, and the policy itself.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function api(path, body) {
    return fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }); });
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(x) { return '$' + Number(x).toFixed(2); }

  function show() {
    api('/api/pending').then(function (list) {
      $('list').innerHTML = list.length ? list.map(function (p) {
        var what = p.purchase.description || p.purchase.merchant || p.purchase.site || 'Purchase';
        return '<div class="panel"><div class="big">' + money(p.purchase.amount) + '</div><p><b>' + esc(what) + '</b><br><span class="muted">Would pay with ' + esc(p.card) + ' (' + p.percentBack + '% back)</span></p>' +
          '<p class="warn">Held because ' + esc(p.reasons.join('; ')) + '.</p>' +
          '<p><button data-approve="' + esc(p.id) + '">Approve and pay</button> <button class="ghost" data-decline="' + esc(p.id) + '">Decline</button></p></div>';
      }).join('') : '<div class="panel"><p class="muted">Nothing waiting.</p></div>';
    });
  }
  $('list').addEventListener('click', function (e) {
    var a = e.target.getAttribute('data-approve'), d = e.target.getAttribute('data-decline');
    if (!a && !d) return;
    e.target.disabled = true;
    (a ? api('/api/approve', { id: a }) : api('/api/decline', { id: d })).then(show).catch(function (err) { $('msg').textContent = err.message; show(); });
  });
  api('/api/policy').then(function (p) { $('per').value = p.perPurchase; $('month').value = p.monthlyBudget; $('cats').value = p.approveCategories.join(', '); });
  $('savePolicy').onclick = function () {
    api('/api/policy', { perPurchase: Number($('per').value), monthlyBudget: Number($('month').value), approveCategories: $('cats').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean) })
      .then(function () { $('msg').textContent = 'Saved.'; }).catch(function (e) { $('msg').textContent = e.message; });
  };
  show();
})();
