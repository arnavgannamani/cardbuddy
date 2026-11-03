// Receipts: totals and one row per purchase. Refreshes every few seconds so it updates live during a demo.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(x) { return '$' + Number(x).toFixed(2); }
  function show() {
    fetch('/api/receipts').then(function (r) { return r.json(); }).then(function (d) {
      $('earned').textContent = money(d.totals.earned); $('def').textContent = money(d.totals.defaultEarned); $('extra').textContent = '+' + money(d.totals.extra);
      $('rows').innerHTML = d.receipts.map(function (r) {
        var when = new Date(r.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        var rail = r.betterRail ? '<br><small class="muted">Paying with ' + esc(r.betterRail.rail === 'paypal' ? 'PayPal' : 'Venmo') + ' on the ' + esc(r.betterRail.card) + ' would earn ' + r.betterRail.percentBack + '%</small>' : '';
        return '<tr><td>' + esc(when) + '</td><td><b>' + esc(r.description || r.merchant) + '</b><br><small class="muted">' + esc(r.merchant) + ' · ' + esc(r.category) + (r.status !== 'paid' ? ' · ' + esc(r.status) : '') + '</small></td>' +
          '<td>' + esc(r.card) + '<br><small class="muted">' + r.percentBack + '%, ' + esc(r.why) + '</small>' + rail + '</td>' +
          '<td class="r">' + money(r.amount) + '</td><td class="r"><b>' + money(r.earned) + '</b></td><td class="r muted">' + money(r.defaultEarned) + '<br><small>' + esc(r.defaultCard) + '</small></td></tr>';
      }).join('') || '<tr><td colspan="6" class="muted">No purchases yet.</td></tr>';
    });
  }
  show();
  setInterval(show, 4000);
})();
